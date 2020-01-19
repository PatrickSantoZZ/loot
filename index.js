'use strict'

const config = require('./config.json'),
	blacklist = config.blacklist.concat(config.motes, config.strongboxes),
	trash = config.trash.concat(config.crystals, config.strongboxes)

module.exports = function Loot(mod) {
	const { command, game } = mod.require,
		{ inventory } = game

	let auto = config.modes.auto || false,
		autotrash = config.modes.trash || false,
		enabled = config.modes.easy || true

	let gameId = -1n,
		playerId = -1,
		myLoc = null,
		mounted = false,
		loot = new Map(),
		lootTimeout = null

	const commands = {
		auto: {
			alias: ['auto', 'autoloot', 'toggle'],
			run: function() {
				auto = !auto
				command.message(`Autoloot mode toggled: ${auto}`)
				if(auto && !lootTimeout) tryLoot()
				else {
					mod.clearTimeout(lootTimeout)
					lootTimeout = null
				}
			}
		},
		enable: {
			alias: ['enable', 'on'],
			run: function() {
				enabled = true
				command.message('Easy looting is enabled.')
			}
		},
		disable: {
			alias: ['disable', 'off'],
			run: function() {
				enabled = false
				command.message('Easy looting is disabled.')
			}
		},
		autotrash: {
			alias: ['autotrash', 'trash'],
			run: function() {
				autotrash = !autotrash
				if(autotrash) inventory.off('update', inventoryUpdate).on('update', inventoryUpdate)
				else inventory.off('update', inventoryUpdate)
				command.message('Autotrash toggled: ' + (autotrash ? 'on' : 'off'))
			}
		}
	}

	mod.hook('S_LOGIN', 14, event => { ({gameId, playerId} = event) })

	command.add('loot', c => {
		if(!c) commands.auto.run()
		else
			for(const cmd in commands)
				if(commands[cmd].alias.includes(c))
					commands[cmd].run()
	})

	mod.hook('S_LOAD_TOPO', 3, event => {
		myLoc = event.loc
		mounted = false
		loot.clear()
	})

	mod.hook('C_PLAYER_LOCATION', 5, event => { myLoc = event.loc })
	mod.hook('S_RETURN_TO_LOBBY', 'raw', () => { loot.clear() })

	mod.hook('S_MOUNT_VEHICLE', 2, event => { if(event.gameId === gameId) mounted = true })
	mod.hook('S_UNMOUNT_VEHICLE', 2, event => { if(event.gameId === gameId) mounted = false })

	mod.hook('S_SPAWN_DROPITEM', 8, event => {
		if(event.owners.indexOf(playerId) !== -1 && !blacklist.includes(event.item)) {
			loot.set(event.gameId, Object.assign(event, { priority: 0 }))

			if(auto && !lootTimeout) tryLoot()
		}
	})

	mod.hook('C_TRY_LOOT_DROPITEM', 'raw', () => {
		if(enabled && !lootTimeout) lootTimeout = mod.setTimeout(tryLoot, config.lootInterval)
	})

	mod.hook('S_DESPAWN_DROPITEM', 4, event => { loot.delete(event.gameId) })

	const inventoryUpdate = () => {
		if (!autotrash) {
			inventory.off('update', inventoryUpdate)
			return
		}
		for (const id of trash)
			for (const item of inventory.findAll(id))
				inventory.delete(item)
	}

	function tryLoot() {
		mod.clearTimeout(lootTimeout)
		lootTimeout = null

		if(!loot.size) return

		if(!mounted)
			for(let l of [...loot.values()].sort((a, b) => a.priority - b.priority))
				if(myLoc.dist3D(l.loc) <= config.lootRadius) {
					mod.toServer('C_TRY_LOOT_DROPITEM', 4, l)
					lootTimeout = mod.setTimeout(tryLoot, Math.min(config.lootInterval * ++l.priority, config.lootThrottleMax))
					return
				}

		if(auto) mod.setTimeout(tryLoot, config.lootScanInterval)
	}
}
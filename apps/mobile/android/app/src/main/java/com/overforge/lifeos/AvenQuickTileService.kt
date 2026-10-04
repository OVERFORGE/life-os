package com.overforge.lifeos

import android.content.Intent
import android.net.Uri
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * AvenQuickTileService
 * 
 * Android Quick Settings Tile for 1-tap Aven activation.
 * Deep links directly to Aven conversation surface without navigational friction.
 */
class AvenQuickTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile ?: return
        tile.state = Tile.STATE_ACTIVE
        tile.label = "Aven"
        tile.updateTile()
    }

    override fun onClick() {
        super.onClick()

        val avenIntent = Intent(Intent.ACTION_VIEW, Uri.parse("mobile://chat-modal")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        // Collapse status bar and launch Aven
        unlockAndRun {
            startActivityAndCollapse(avenIntent)
        }
    }
}

/* AUTO-GENERATED — do not edit. Run scripts/gen_chains.py to regenerate. */
#include "game_memory.h"

#define GM_MAX_OFFSETS 16

typedef struct {
    const char* name;
    const char* module;
    uintptr_t   offsets[16];
    int         offset_count;
    gm_dtype_t  dtype;
} gm_chain_def_t;

static const gm_chain_def_t GM_CHAINS[] = {
    { "multiplayer_vehicle_energy", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x60, 0x258, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_vehicle_health", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x1D0, 0x48, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_vehicle_boost", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x68, 0x260, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_hud_score", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x148, 0x268, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_hud_rangefinder", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x190, 0xA8, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_camera_zoom", "plugin_sound.dll", {0x43B508, 0x10, 0, 0x10, 0x70, 0x308, 0xD4, 0, 0, 0, 0, 0, 0, 0, 0, 0}, 7, GM_UINT32 },
    { "multiplayer_is_fp_view", "plugin_sound.dll", {0x43B508, 0x10, 0, 0x10, 0x70, 0x308, 0xC3, 0, 0, 0, 0, 0, 0, 0, 0, 0}, 7, GM_UINT8 },
    { "multiplayer_vehicle_autocannon_overheat", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x188, 0x1D0, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_FLOAT },
    { "training_vehicle_energy", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x8, 0xC8, 0x10, 0x7C0, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "training_vehicle_rangefinder", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x8, 0xC8, 0x188, 0x110, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_ability_slot_0_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x20, 0x48, 0xC0, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_ability_slot_1_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x20, 0x48, 0x1D8, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_ability_slot_2_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x20, 0x48, 0x2F0, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_ability_slot_3_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x20, 0x48, 0x408, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_ability_slot_0_progress", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x20, 0x48, 0xC4, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_equipment_slot_0_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x28, 0x48, 0xC0, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_equipment_slot_1_cooldown", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x28, 0x48, 0x1D8, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_equipment_slot_0_progress", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x28, 0x48, 0xC4, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_equipment_slot_1_progress", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x28, 0x48, 0x1DC, 0, 0, 0, 0, 0, 0, 0}, 9, GM_FLOAT },
    { "multiplayer_primary_ammo_current", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x168, 0x60, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_primary_ammo_max", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x168, 0x68, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_secondary_ammo_current", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x170, 0x60, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_secondary_ammo_max", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x170, 0x68, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_UINT32 },
    { "multiplayer_reload_time_remaining", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x1A0, 0x54, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_FLOAT },
    { "multiplayer_reload_time_total", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x1A0, 0x58, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_FLOAT },
    { "multiplayer_active_reload_time_remaining", "cohtml.WindowsDesktop.dll", {0x64D218, 0x10, 0x48, 0x80, 0x20, 0xC8, 0x1B8, 0x50, 0, 0, 0, 0, 0, 0, 0, 0}, 8, GM_FLOAT },
    { NULL, NULL, {0}, 0, (gm_dtype_t)0 }
};

/* 26 chains */

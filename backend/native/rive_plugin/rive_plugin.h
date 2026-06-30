/*
 * rive_plugin.h — C API for the Rive C++ runtime DLL.
 *
 * Build: see CMakeLists.txt in this directory.
 * Output: native/bin/rive_plugin.dll
 *
 * Each RiveHandle owns one D3D11 device (WARP software rasterizer),
 * one artboard, optional state machine, optional ViewModel instance,
 * and a staging texture for RGBA readback.
 */

#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef _WIN32
#  ifdef RIVE_PLUGIN_EXPORTS
#    define RIVE_API __declspec(dllexport)
#  else
#    define RIVE_API __declspec(dllimport)
#  endif
#else
#  define RIVE_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef void* RiveHandle;

/* Lifecycle ---------------------------------------------------------------- */

/* Create a Rive context of the given pixel dimensions.
   Uses the D3D11 WARP adapter (CPU software rasterizer) by default.
   Returns NULL on failure. */
RIVE_API RiveHandle rive_create(int width, int height);

/* Destroy a context created by rive_create. */
RIVE_API void rive_destroy(RiveHandle h);

/* Content loading ---------------------------------------------------------- */

/* Load a .riv file from a UTF-8 path. Returns 1 on success, 0 on failure. */
RIVE_API int rive_load_file(RiveHandle h, const char* path);

/* Load a .riv file from a byte buffer. Returns 1 on success, 0 on failure. */
RIVE_API int rive_load_bytes(RiveHandle h, const uint8_t* data, size_t len);

/* State machine (legacy input API) ---------------------------------------- */

/* Select a named artboard. Must be called after rive_load_*.
   If name is NULL or not found, falls back to the default artboard. */
RIVE_API void rive_set_artboard(RiveHandle h, const char* name);

/* Activate a named state machine. Must be called after rive_load_*. */
RIVE_API void rive_set_state_machine(RiveHandle h, const char* name);

/* Set a boolean input on the active state machine. */
RIVE_API void rive_sm_bool(RiveHandle h, const char* name, int value);

/* Set a number input on the active state machine. */
RIVE_API void rive_sm_number(RiveHandle h, const char* name, float value);

/* Fire a trigger input on the active state machine. */
RIVE_API void rive_sm_trigger(RiveHandle h, const char* name);

/* ViewModel (modern data binding) ----------------------------------------- */
/*
 * Paths use "/" separators for nested properties, e.g. "header/title".
 * All setters are no-ops if the path does not exist.
 */

/* Create and bind a ViewModel instance by name from the loaded file. */
RIVE_API void rive_vm_bind(RiveHandle h, const char* vm_name);

RIVE_API void  rive_vm_set_number(RiveHandle h, const char* path, float value);
RIVE_API void  rive_vm_set_bool  (RiveHandle h, const char* path, int value);
RIVE_API void  rive_vm_set_string(RiveHandle h, const char* path, const char* value);
RIVE_API void  rive_vm_set_color (RiveHandle h, const char* path, uint32_t argb);
RIVE_API void  rive_vm_set_enum  (RiveHandle h, const char* path, const char* label);
RIVE_API void  rive_vm_trigger   (RiveHandle h, const char* path);
RIVE_API float rive_vm_get_number(RiveHandle h, const char* path);
RIVE_API int   rive_vm_get_bool  (RiveHandle h, const char* path);

/* Rendering ---------------------------------------------------------------- */

/* Advance animation state by dt seconds. Call once per frame. */
RIVE_API void rive_advance(RiveHandle h, float dt_seconds);

/* Render current frame into caller-allocated RGBA buffer (width*height*4 bytes).
   Pixels are straight (non-premultiplied) RGBA, top-row first. */
RIVE_API void rive_render(RiveHandle h, uint8_t* out_rgba);

#ifdef __cplusplus
}
#endif

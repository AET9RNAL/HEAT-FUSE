/*
 * game_memory.h — C API for the FUSE game memory reader DLL.
 *
 * Build: see native/game_memory/premake5.lua
 * Output: native/bin/game_memory.dll
 *
 * Pointer chains are compiled in from assets/pointer_chains.json via
 * scripts/gen_chains.py — run that script before building.
 * The JSON is the dev source of truth; it is not shipped at runtime.
 */
#pragma once
#include <stdint.h>

#ifdef _WIN32
#  ifdef GM_EXPORTS
#    define GM_API __declspec(dllexport)
#  else
#    define GM_API __declspec(dllimport)
#  endif
#else
#  define GM_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Result codes --------------------------------------------------------------- */

typedef enum {
    GM_OK              = 0,
    GM_ERR_NOT_FOUND   = 1,   /* process not running            */
    GM_ERR_ACCESS      = 2,   /* OpenProcess denied             */
    GM_ERR_DISCONNECTED = 3,  /* gm_open not called / lost      */
    GM_ERR_UNKNOWN     = 4,   /* chain name not in table        */
    GM_ERR_NULL_PTR    = 5,   /* null pointer in chain          */
    GM_ERR_READ        = 6,   /* ReadProcessMemory failed       */
    GM_ERR_COOLDOWN    = 7,   /* chain suppressed after error   */
} gm_result_t;

/* dtype enum — mirrors generated_chains.h, defined here so generated header
   can include this header without circular deps. */
typedef enum {
    GM_UINT8  = 0, GM_INT8,
    GM_UINT16,     GM_INT16,
    GM_UINT32,     GM_INT32,
    GM_UINT64,     GM_INT64,
    GM_FLOAT,
    GM_DOUBLE,
} gm_dtype_t;

/* Lifecycle ------------------------------------------------------------------ */

GM_API gm_result_t gm_open(const char* process_name);
GM_API void        gm_close(void);
GM_API int         gm_is_connected(void);

/* Read ----------------------------------------------------------------------- */

/*
 * Write the raw value for chain_name into out_buf.
 * out_buf must be at least 8 bytes regardless of dtype.
 * Returns GM_OK on success; buf contents undefined on error.
 */
GM_API gm_result_t gm_read(const char* chain_name, void* out_buf);

/*
 * Return the gm_dtype_t value for chain_name, or -1 if not found.
 * Use this to decode the raw bytes from gm_read().
 */
GM_API int gm_dtype(const char* chain_name);

#ifdef __cplusplus
}
#endif

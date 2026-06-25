#include <windows.h>
#include <tlhelp32.h>
#include <string.h>
#include <stdint.h>

#include "game_memory.h"
#include "generated_chains.h"

/* ---- Configuration -------------------------------------------------------- */

#define GM_MAX_MODULES      256
#define GM_MAX_CHAINS       128
#define GM_CHAIN_RETRY_MS   3000ULL

/* ---- Module base cache ---------------------------------------------------- */

typedef struct {
    char      name[256];
    uintptr_t base;
} gm_module_t;

/* ---- Global state --------------------------------------------------------- */

static HANDLE       s_proc        = NULL;
static DWORD        s_pid         = 0;
static int          s_connected   = 0;
static char         s_proc_name[MAX_PATH] = {0};

static gm_module_t  s_mod_cache[GM_MAX_MODULES];
static int          s_mod_count   = 0;

/* Per-chain error cooldown indexed by position in GM_CHAINS[] */
static ULONGLONG    s_retry_after[GM_MAX_CHAINS];
static int          s_chain_count = 0;

/* ---- Internal helpers ----------------------------------------------------- */

static void _count_chains(void) {
    if (s_chain_count) return;
    int n = 0;
    while (n < GM_MAX_CHAINS && GM_CHAINS[n].name != NULL) n++;
    s_chain_count = n;
}

static void _clear_modules(void) {
    s_mod_count = 0;
    memset(s_mod_cache, 0, sizeof(s_mod_cache));
}

static DWORD _find_pid(const char* name) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;

    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(pe);
    DWORD result = 0;

    if (Process32First(snap, &pe)) {
        do {
            if (_stricmp(pe.szExeFile, name) == 0) {
                result = pe.th32ProcessID;
                break;
            }
        } while (Process32Next(snap, &pe));
    }
    CloseHandle(snap);
    return result;
}

static uintptr_t _get_module_base(const char* mod_name) {
    /* Cache hit */
    for (int i = 0; i < s_mod_count; i++) {
        if (_stricmp(s_mod_cache[i].name, mod_name) == 0)
            return s_mod_cache[i].base;
    }

    /* Enumerate modules */
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, s_pid);
    if (snap == INVALID_HANDLE_VALUE) return 0;

    MODULEENTRY32 me;
    me.dwSize = sizeof(me);
    uintptr_t result = 0;

    if (Module32First(snap, &me)) {
        do {
            if (_stricmp(me.szModule, mod_name) == 0) {
                result = (uintptr_t)me.modBaseAddr;
                if (s_mod_count < GM_MAX_MODULES) {
                    strncpy_s(s_mod_cache[s_mod_count].name,
                              sizeof(s_mod_cache[0].name),
                              me.szModule, _TRUNCATE);
                    s_mod_cache[s_mod_count].base = result;
                    s_mod_count++;
                }
                break;
            }
        } while (Module32Next(snap, &me));
    }
    CloseHandle(snap);
    return result;
}

static int _read_mem(uintptr_t addr, void* buf, size_t size) {
    SIZE_T n = 0;
    return ReadProcessMemory(s_proc, (LPCVOID)addr, buf, size, &n) && n == size;
}

static uintptr_t _deref(uintptr_t addr) {
    uintptr_t val = 0;
    _read_mem(addr, &val, sizeof(val));
    return val;
}

static int _find_chain(const char* name) {
    _count_chains();
    for (int i = 0; i < s_chain_count; i++) {
        if (_stricmp(GM_CHAINS[i].name, name) == 0)
            return i;
    }
    return -1;
}

/* ---- Public API ----------------------------------------------------------- */

GM_API gm_result_t gm_open(const char* process_name) {
    gm_close();
    _count_chains();

    strncpy_s(s_proc_name, sizeof(s_proc_name), process_name, _TRUNCATE);

    DWORD pid = _find_pid(process_name);
    if (!pid) return GM_ERR_NOT_FOUND;

    HANDLE h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (!h) return GM_ERR_ACCESS;

    s_pid       = pid;
    s_proc      = h;
    s_connected = 1;
    _clear_modules();
    memset(s_retry_after, 0, sizeof(s_retry_after));
    return GM_OK;
}

GM_API void gm_close(void) {
    if (s_proc) { CloseHandle(s_proc); s_proc = NULL; }
    s_pid       = 0;
    s_connected = 0;
    _clear_modules();
}

GM_API int gm_is_connected(void) {
    return s_connected;
}

GM_API gm_result_t gm_read(const char* chain_name, void* out_buf) {
    if (!s_connected) return GM_ERR_DISCONNECTED;

    int idx = _find_chain(chain_name);
    if (idx < 0 || idx >= GM_MAX_CHAINS) return GM_ERR_UNKNOWN;

    ULONGLONG now = GetTickCount64();
    if (now < s_retry_after[idx]) return GM_ERR_COOLDOWN;

    const gm_chain_def_t* c = &GM_CHAINS[idx];

    uintptr_t base = _get_module_base(c->module);
    if (!base) return GM_ERR_READ;

    /* Walk all but last offset as pointers */
    uintptr_t addr = base;
    for (int i = 0; i < c->offset_count - 1; i++) {
        addr = _deref(addr + c->offsets[i]);
        if (!addr) {
            s_retry_after[idx] = now + GM_CHAIN_RETRY_MS;
            return GM_ERR_NULL_PTR;
        }
    }
    uintptr_t final_addr = addr + c->offsets[c->offset_count - 1];

    size_t sz;
    switch (c->dtype) {
        case GM_UINT8:  case GM_INT8:              sz = 1; break;
        case GM_UINT16: case GM_INT16:             sz = 2; break;
        case GM_UINT32: case GM_INT32: case GM_FLOAT: sz = 4; break;
        default:                                   sz = 8; break;
    }

    if (!_read_mem(final_addr, out_buf, sz)) {
        if (!_find_pid(s_proc_name)) {
            s_connected = 0;
        } else {
            _clear_modules();
            s_retry_after[idx] = now + GM_CHAIN_RETRY_MS;
        }
        return GM_ERR_READ;
    }

    s_retry_after[idx] = 0;
    return GM_OK;
}

GM_API int gm_dtype(const char* chain_name) {
    int idx = _find_chain(chain_name);
    return idx >= 0 ? (int)GM_CHAINS[idx].dtype : -1;
}

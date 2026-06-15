/*
 * rive_plugin.cpp — Rive C++ runtime wrapped as a thin C DLL.
 *
 * Renderer: D3D11 (WARP software adapter by default, no GPU required).
 * Pixel format: DXGI_FORMAT_R8G8B8A8_UNORM, straight alpha, top-row first.
 */

#include "rive_plugin.h"

#include <d3d11.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <string>
#include <vector>
#include <memory>
#include <cstring>
#include <fstream>

using Microsoft::WRL::ComPtr;

#include <rive/file.hpp>
#include <rive/artboard.hpp>
#include <rive/animation/state_machine_instance.hpp>
#include <rive/animation/state_machine_input_instance.hpp>
#include <rive/viewmodel/runtime/viewmodel_runtime.hpp>
#include <rive/viewmodel/runtime/viewmodel_instance_runtime.hpp>
#include <rive/renderer/render_context.hpp>
#include <rive/renderer/rive_renderer.hpp>
#include <rive/renderer/d3d11/render_context_d3d_impl.hpp>

/* ============================================================ */
/*  Internal context struct                                      */
/* ============================================================ */

struct RiveCtx {
    ComPtr<ID3D11Device>           device;
    ComPtr<ID3D11DeviceContext>    ctx11;
    ComPtr<ID3D11Texture2D>        rtTex;      /* render target texture */
    ComPtr<ID3D11RenderTargetView> rtv;        /* for explicit pre-frame clear */
    ComPtr<ID3D11Texture2D>        stagingTex; /* CPU-readable copy */

    int width  = 0;
    int height = 0;

    std::unique_ptr<rive::gpu::RenderContext> riveCtx;
    rive::rcp<rive::gpu::RenderTargetD3D>     renderTarget;

    rive::rcp<rive::File>                       file;
    std::unique_ptr<rive::ArtboardInstance>     artboard;
    std::unique_ptr<rive::StateMachineInstance> sm;

    rive::rcp<rive::ViewModelInstanceRuntime> vmInst;

    uint64_t frameNumber = 0;
};

static RiveCtx* ctx_of(RiveHandle h) { return static_cast<RiveCtx*>(h); }

/* ============================================================ */
/*  Helpers                                                      */
/* ============================================================ */

/* Unpremultiply RGBA in-place. Rive renders premultiplied alpha. */
static void unpremultiply(uint8_t* rgba, int pixels) {
    for (int i = 0; i < pixels; ++i) {
        uint8_t a = rgba[3];
        if (a > 0 && a < 255) {
            rgba[0] = (uint8_t)((rgba[0] * 255u + a / 2) / a);
            rgba[1] = (uint8_t)((rgba[1] * 255u + a / 2) / a);
            rgba[2] = (uint8_t)((rgba[2] * 255u + a / 2) / a);
        } else if (a == 0) {
            rgba[0] = rgba[1] = rgba[2] = 0;
        }
        rgba += 4;
    }
}

/* ============================================================ */
/*  Lifecycle                                                    */
/* ============================================================ */

RiveHandle rive_create(int width, int height) {
    auto* c = new RiveCtx();
    c->width  = width;
    c->height = height;

    /* Create D3D11 device — hardware GPU preferred, WARP as fallback */
    D3D_FEATURE_LEVEL fl;
    UINT flags = 0;
#ifdef _DEBUG
    flags |= D3D11_CREATE_DEVICE_DEBUG;
#endif
    HRESULT hr = D3D11CreateDevice(
        nullptr,
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr, flags,
        nullptr, 0,
        D3D11_SDK_VERSION,
        c->device.GetAddressOf(), &fl,
        c->ctx11.GetAddressOf()
    );
    if (FAILED(hr)) {
        hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_WARP,
            nullptr, flags,
            nullptr, 0,
            D3D11_SDK_VERSION,
            c->device.GetAddressOf(), &fl,
            c->ctx11.GetAddressOf()
        );
    }
    if (FAILED(hr)) { delete c; return nullptr; }

    /* Render target texture (GPU-writable, RGBA8) */
    D3D11_TEXTURE2D_DESC rtDesc = {};
    rtDesc.Width            = (UINT)width;
    rtDesc.Height           = (UINT)height;
    rtDesc.MipLevels        = 1;
    rtDesc.ArraySize        = 1;
    rtDesc.Format           = DXGI_FORMAT_R8G8B8A8_UNORM;
    rtDesc.SampleDesc.Count = 1;
    rtDesc.Usage            = D3D11_USAGE_DEFAULT;
    rtDesc.BindFlags        = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE
                            | D3D11_BIND_UNORDERED_ACCESS;
    hr = c->device->CreateTexture2D(&rtDesc, nullptr, c->rtTex.GetAddressOf());
    if (FAILED(hr)) { delete c; return nullptr; }

    hr = c->device->CreateRenderTargetView(c->rtTex.Get(), nullptr, c->rtv.GetAddressOf());
    if (FAILED(hr)) { delete c; return nullptr; }

    /* Staging texture (CPU-readable) */
    D3D11_TEXTURE2D_DESC stageDesc = rtDesc;
    stageDesc.Usage          = D3D11_USAGE_STAGING;
    stageDesc.BindFlags      = 0;
    stageDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    hr = c->device->CreateTexture2D(&stageDesc, nullptr, c->stagingTex.GetAddressOf());
    if (FAILED(hr)) { delete c; return nullptr; }

    /* Rive D3D11 render context */
    c->riveCtx = rive::gpu::RenderContextD3DImpl::MakeContext(
        c->device, c->ctx11, {}
    );
    if (!c->riveCtx) { delete c; return nullptr; }

    /* Render target — wraps our D3D11 texture */
    auto* d3dImpl = c->riveCtx->static_impl_cast<rive::gpu::RenderContextD3DImpl>();
    c->renderTarget = d3dImpl->makeRenderTarget((uint32_t)width, (uint32_t)height);
    c->renderTarget->setTargetTexture(c->rtTex);

    return c;
}

void rive_destroy(RiveHandle h) {
    if (!h) return;
    auto* c = ctx_of(h);
    c->vmInst = nullptr;
    c->sm.reset();
    c->artboard.reset();
    c->file = nullptr;
    c->renderTarget.reset();
    c->riveCtx.reset();
    /* ComPtr members release automatically */
    delete c;
}

/* ============================================================ */
/*  Content loading                                              */
/* ============================================================ */

static bool load_riv(RiveCtx* c, const uint8_t* data, size_t len) {
    c->vmInst = nullptr;
    c->sm.reset();
    c->artboard.reset();
    c->file = nullptr;

    rive::Factory* factory = c->riveCtx.get();

    rive::ImportResult result;
    c->file = rive::File::import(
        rive::Span<const uint8_t>(data, len),
        factory,
        &result
    );
    if (!c->file || result != rive::ImportResult::success) {
        c->file = nullptr;
        return false;
    }

    c->artboard = c->file->artboardDefault();
    if (!c->artboard) return false;

    c->artboard->advance(0);
    return true;
}

int rive_load_file(RiveHandle h, const char* path) {
    auto* c = ctx_of(h);
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f.is_open()) return 0;
    std::streamsize size = f.tellg();
    f.seekg(0);
    std::vector<uint8_t> buf((size_t)size);
    f.read(reinterpret_cast<char*>(buf.data()), size);
    return load_riv(c, buf.data(), buf.size()) ? 1 : 0;
}

int rive_load_bytes(RiveHandle h, const uint8_t* data, size_t len) {
    return load_riv(ctx_of(h), data, len) ? 1 : 0;
}

/* ============================================================ */
/*  State machine                                                */
/* ============================================================ */

void rive_set_state_machine(RiveHandle h, const char* name) {
    auto* c = ctx_of(h);
    if (!c->artboard) return;
    c->sm.reset();
    c->sm = c->artboard->stateMachineNamed(name);
    if (!c->sm)
        c->sm = c->artboard->stateMachineAt(0);
}

void rive_sm_bool(RiveHandle h, const char* name, int value) {
    auto* c = ctx_of(h);
    if (!c->sm) return;
    if (auto* inp = c->sm->getBool(name))
        inp->value(value != 0);
}

void rive_sm_number(RiveHandle h, const char* name, float value) {
    auto* c = ctx_of(h);
    if (!c->sm) return;
    if (auto* inp = c->sm->getNumber(name))
        inp->value(value);
}

void rive_sm_trigger(RiveHandle h, const char* name) {
    auto* c = ctx_of(h);
    if (!c->sm) return;
    if (auto* inp = c->sm->getTrigger(name))
        inp->fire();
}

/* ============================================================ */
/*  ViewModel                                                    */
/* ============================================================ */

void rive_vm_bind(RiveHandle h, const char* vm_name) {
    auto* c = ctx_of(h);
    if (!c->file || !c->artboard) return;

    rive::ViewModelRuntime* vmRuntime = c->file->viewModelByName(vm_name);
    if (!vmRuntime) return;

    c->vmInst = vmRuntime->createDefaultInstance();
    if (!c->vmInst) return;

    c->artboard->bindViewModelInstance(c->vmInst->instance());
    if (c->sm)
        c->sm->bindViewModelInstance(c->vmInst->instance());
}

void rive_vm_set_number(RiveHandle h, const char* path, float value) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyNumber(path)) p->value(value);
}

void rive_vm_set_bool(RiveHandle h, const char* path, int value) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyBoolean(path)) p->value(value != 0);
}

void rive_vm_set_string(RiveHandle h, const char* path, const char* value) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyString(path)) p->value(std::string(value));
}

void rive_vm_set_color(RiveHandle h, const char* path, uint32_t argb) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyColor(path)) p->value((int)argb);
}

void rive_vm_set_enum(RiveHandle h, const char* path, const char* label) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyEnum(path)) p->value(std::string(label));
}

void rive_vm_trigger(RiveHandle h, const char* path) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return;
    if (auto* p = c->vmInst->propertyTrigger(path)) p->trigger();
}

float rive_vm_get_number(RiveHandle h, const char* path) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return 0.0f;
    auto* p = c->vmInst->propertyNumber(path);
    return p ? p->value() : 0.0f;
}

int rive_vm_get_bool(RiveHandle h, const char* path) {
    auto* c = ctx_of(h);
    if (!c->vmInst) return 0;
    auto* p = c->vmInst->propertyBoolean(path);
    return (p && p->value()) ? 1 : 0;
}

/* ============================================================ */
/*  Rendering                                                    */
/* ============================================================ */

void rive_advance(RiveHandle h, float dt_seconds) {
    auto* c = ctx_of(h);
    if (!c->artboard) return;
    if (c->sm) {
        c->sm->advance(dt_seconds);
    }
    c->artboard->advance(dt_seconds);
}

void rive_render(RiveHandle h, uint8_t* out_rgba) {
    auto* c = ctx_of(h);
    if (!c->artboard || !out_rgba) return;

    ++c->frameNumber;

    /* Guarantee transparent background regardless of Rive's internal clear */
    const float kTransparent[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
    c->ctx11->ClearRenderTargetView(c->rtv.Get(), kTransparent);

    rive::gpu::RenderContext::FrameDescriptor fd;
    fd.renderTargetWidth  = (uint32_t)c->width;
    fd.renderTargetHeight = (uint32_t)c->height;
    fd.clearColor         = 0x00000000;
    c->riveCtx->beginFrame(std::move(fd));

    rive::RiveRenderer renderer(c->riveCtx.get());
    renderer.save();
    renderer.align(
        rive::Fit::contain,
        rive::Alignment::center,
        rive::AABB(0.f, 0.f, (float)c->width, (float)c->height),
        c->artboard->bounds()
    );
    c->artboard->draw(&renderer);
    renderer.restore();

    c->riveCtx->flush({
        .renderTarget      = c->renderTarget.get(),
        .currentFrameNumber = c->frameNumber,
        .safeFrameNumber    = c->frameNumber > 1 ? c->frameNumber - 1 : 0,
    });

    /* CPU readback */
    c->ctx11->CopyResource(c->stagingTex.Get(), c->rtTex.Get());

    D3D11_MAPPED_SUBRESOURCE mapped = {};
    HRESULT hr = c->ctx11->Map(c->stagingTex.Get(), 0, D3D11_MAP_READ, 0, &mapped);
    if (FAILED(hr)) return;

    const uint8_t* src  = static_cast<const uint8_t*>(mapped.pData);
    const int       rowBytes = c->width * 4;
    for (int y = 0; y < c->height; ++y) {
        std::memcpy(out_rgba + y * rowBytes, src + y * mapped.RowPitch, rowBytes);
    }

    c->ctx11->Unmap(c->stagingTex.Get(), 0);
    unpremultiply(out_rgba, c->width * c->height);
}

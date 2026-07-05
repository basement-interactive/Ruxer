#ifndef WEBRTC_SYS_NVIDIA_CUDA_CONTEXT_H
#define WEBRTC_SYS_NVIDIA_CUDA_CONTEXT_H

// FLUXER: on Windows, <cuda.h> pulls <windows.h>, which must come AFTER
// <winsock2.h> or the WinSock 1.1 declarations collide with webrtc's winsock2
// (ws2def.h IPPROTO_* enum-vs-macro break). This prelude enforces the ordering
// and is a no-op on non-Windows. It must precede the FIRST <cuda.h> in every
// TU that reaches the NVIDIA code — this header is the common funnel; impl
// headers that include <cuda.h> directly include the prelude themselves.
#include "flx_win_prelude.h"
#include <cuda.h>

namespace livekit_ffi {

class CudaContext {
 public:
  CudaContext() = default;
  ~CudaContext() = default;

  static bool IsAvailable();

  static CudaContext* GetInstance();
  bool Initialize();
  bool IsInitialized() const { return cu_context_ != nullptr; }
  CUcontext GetContext() const;

  void Shutdown();

 private:
  CUdevice cu_device_ = 0;
  CUcontext cu_context_ = nullptr;
};

}  // namespace livekit_ffi

#endif  // WEBRTC_SYS_NVIDIA_CUDA_CONTEXT_H

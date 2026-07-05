// FLUXER ADDITION — Windows include-order prelude for the NVIDIA HW codec TU's.
//
// Every nvidia/*.cpp starts with `#include <cuda.h>`, and on Windows cuda.h
// pulls in <windows.h>. WebRTC's own headers (included later in the same TU)
// pull <winsock2.h> / <ws2def.h>. If <windows.h> is seen first WITHOUT the
// winsock2 guard, the ancient WinSock 1.1 declarations from <winsock.h> leak in
// and then collide with <winsock2.h>, producing the well-known
//   ws2def.h: error C2143: syntax error: missing '}' before 'constant'
//   winsock2.h: error C2059: syntax error: '}'
// enum-vs-macro breakage on the IPPROTO_* constants.
//
// The fix is the standard one: make sure <winsock2.h> is included BEFORE
// <windows.h>, and suppress the legacy <winsock.h> that <windows.h> would
// otherwise include. This header is force-included (MSVC /FI) ahead of every
// nvidia TU by build.rs, so it runs before cuda.h's <windows.h>.
#pragma once

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
// Pull winsock2 first; also define _WINSOCKAPI_ so a later <windows.h> will not
// re-include the incompatible WinSock 1.1 <winsock.h>.
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#endif

// SPDX-License-Identifier: AGPL-3.0-or-later

use zstd::zstd_safe::zstd_sys::ZSTD_EndDirective;
use zstd::zstd_safe::{CCtx, CParameter, DCtx, InBuffer, OutBuffer};

use crate::zstd_frame::{MAX_DECOMPRESSED_BYTES, READ_BUFFER_BYTES, ZstdError};

pub struct ZstdStreamEncoder {
    context: CCtx<'static>,
}

impl ZstdStreamEncoder {
    pub fn new(level: i32) -> Result<Self, ZstdError> {
        let mut context = CCtx::try_create().ok_or(ZstdError::OutOfMemory)?;
        context
            .set_parameter(CParameter::CompressionLevel(level))
            .map_err(|_| ZstdError::Encode)?;
        Ok(Self { context })
    }

    pub fn compress_chunk(&mut self, input: &[u8]) -> Result<Vec<u8>, ZstdError> {
        let mut input = InBuffer::around(input);
        let mut output = Vec::new();
        let mut buffer = [0u8; READ_BUFFER_BYTES];

        loop {
            let previous_input_pos = input.pos();
            let (remaining, written) = {
                let mut out_buffer = OutBuffer::around(&mut buffer[..]);
                let remaining = self
                    .context
                    .compress_stream2(&mut out_buffer, &mut input, ZSTD_EndDirective::ZSTD_e_flush)
                    .map_err(|_| ZstdError::Encode)?;
                (remaining, out_buffer.pos())
            };

            append_output(&mut output, &buffer[..written])?;

            if remaining == 0 {
                return Ok(output);
            }
            let made_progress = input.pos() > previous_input_pos || written > 0;
            if !made_progress {
                return Err(ZstdError::Encode);
            }
        }
    }
}

pub struct ZstdStreamDecoder {
    context: DCtx<'static>,
}

impl ZstdStreamDecoder {
    pub fn new() -> Result<Self, ZstdError> {
        let mut context = DCtx::try_create().ok_or(ZstdError::OutOfMemory)?;
        context.init().map_err(|_| ZstdError::Decode)?;
        Ok(Self { context })
    }

    pub fn decompress_chunk(&mut self, input: &[u8]) -> Result<Vec<u8>, ZstdError> {
        if input.is_empty() {
            return Ok(Vec::new());
        }

        let mut input = InBuffer::around(input);
        let mut output = Vec::new();
        let mut buffer = [0u8; READ_BUFFER_BYTES];

        loop {
            let previous_input_pos = input.pos();
            let (remaining, written) = {
                let mut out_buffer = OutBuffer::around(&mut buffer[..]);
                let remaining = self
                    .context
                    .decompress_stream(&mut out_buffer, &mut input)
                    .map_err(|_| ZstdError::Decode)?;
                (remaining, out_buffer.pos())
            };

            append_output(&mut output, &buffer[..written])?;
            let consumed = input.pos() > previous_input_pos;
            if input.pos() == input.src.len() && written < buffer.len() {
                return Ok(output);
            }
            if !consumed && written == 0 {
                if remaining > 0 && input.pos() == input.src.len() {
                    return Ok(output);
                }
                return Err(ZstdError::Decode);
            }
        }
    }
}

fn append_output(output: &mut Vec<u8>, bytes: &[u8]) -> Result<(), ZstdError> {
    if bytes.is_empty() {
        return Ok(());
    }
    let next_len = output
        .len()
        .checked_add(bytes.len())
        .ok_or(ZstdError::DecompressedSizeTooLarge)?;
    if next_len > MAX_DECOMPRESSED_BYTES {
        return Err(ZstdError::DecompressedSizeTooLarge);
    }
    output
        .try_reserve(bytes.len())
        .map_err(|_| ZstdError::OutOfMemory)?;
    output.extend_from_slice(bytes);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zstd::stream::raw::{Encoder, InBuffer, Operation, OutBuffer};

    fn compress_stream_chunk(encoder: &mut Encoder<'_>, input: &[u8]) -> Vec<u8> {
        let mut compressed = Vec::new();
        let mut input = InBuffer::around(input);
        let mut buffer = [0u8; READ_BUFFER_BYTES];

        while input.pos() < input.src.len() {
            let written = {
                let mut output = OutBuffer::around(&mut buffer[..]);
                encoder.run(&mut input, &mut output).unwrap();
                output.pos()
            };
            compressed.extend_from_slice(&buffer[..written]);
        }

        loop {
            let (remaining, written) = {
                let mut output = OutBuffer::around(&mut buffer[..]);
                let remaining = encoder.flush(&mut output).unwrap();
                (remaining, output.pos())
            };
            compressed.extend_from_slice(&buffer[..written]);
            if remaining == 0 {
                break;
            }
        }

        compressed
    }

    #[test]
    fn decodes_multiple_flushed_chunks_from_one_zstd_stream() {
        let mut encoder = Encoder::new(1).unwrap();
        let mut decoder = ZstdStreamDecoder::new().unwrap();

        let first = compress_stream_chunk(&mut encoder, br#"{"op":10}"#);
        let second = compress_stream_chunk(&mut encoder, br#"{"op":11}"#);

        assert_eq!(decoder.decompress_chunk(&first).unwrap(), br#"{"op":10}"#);
        assert_eq!(decoder.decompress_chunk(&second).unwrap(), br#"{"op":11}"#);
    }

    #[test]
    fn keeps_partial_frame_state_between_chunks() {
        let compressed = zstd::stream::encode_all(&b"hello stream"[..], 1).unwrap();
        let split_at = compressed.len() / 2;
        let mut decoder = ZstdStreamDecoder::new().unwrap();

        let first = decoder.decompress_chunk(&compressed[..split_at]).unwrap();
        let second = decoder.decompress_chunk(&compressed[split_at..]).unwrap();

        assert_eq!([first, second].concat(), b"hello stream");
    }

    #[test]
    fn encoder_and_decoder_roundtrip_ten_thousand_messages_bidirectionally() {
        let mut encoder = ZstdStreamEncoder::new(3).unwrap();
        let mut decoder = ZstdStreamDecoder::new().unwrap();

        for seq in 1..=10_000 {
            let payload = format!(
                r#"{{"op":1,"d":{},"meta":"bidirectional zstd stream message {}"}}"#,
                seq, seq
            );
            let compressed = encoder.compress_chunk(payload.as_bytes()).unwrap();
            assert!(!compressed.is_empty());
            let decoded = decoder.decompress_chunk(&compressed).unwrap();
            assert_eq!(decoded, payload.as_bytes());
        }
    }

    #[test]
    fn encoder_handles_a_payload_larger_than_the_buffer() {
        let mut encoder = ZstdStreamEncoder::new(3).unwrap();
        let mut decoder = ZstdStreamDecoder::new().unwrap();
        let payload = vec![b'a'; READ_BUFFER_BYTES * 8 + 123];

        let compressed = encoder.compress_chunk(&payload).unwrap();
        assert_eq!(decoder.decompress_chunk(&compressed).unwrap(), payload);
    }

    #[test]
    fn decodes_ten_thousand_flushed_gateway_json_chunks() {
        let mut encoder = Encoder::new(3).unwrap();
        let mut decoder = ZstdStreamDecoder::new().unwrap();

        for seq in 1..=10_000 {
            let payload = format!(
                r#"{{"op":0,"t":"MESSAGE_CREATE","s":{},"d":{{"id":"{}","channel_id":"1497639278555484216","guild_id":"1427764661718740994","content":"gateway zstd stream stress payload {}"}}}}"#,
                seq, seq, seq
            );
            let compressed = compress_stream_chunk(&mut encoder, payload.as_bytes());
            let decoded = decoder.decompress_chunk(&compressed).unwrap();

            assert_eq!(decoded, payload.as_bytes());
        }
    }
}

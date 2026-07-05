// SPDX-License-Identifier: AGPL-3.0-or-later

use std::io::Read;

pub(crate) const READ_BUFFER_BYTES: usize = 16 * 1024;
pub(crate) const MAX_DECOMPRESSED_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug)]
pub enum ZstdError {
    DecompressedSizeTooLarge,
    Decode,
    Encode,
    OutOfMemory,
}

impl ZstdError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::DecompressedSizeTooLarge => "zstd decompressed payload is too large",
            Self::Decode => "zstd decompression failed",
            Self::Encode => "zstd compression failed",
            Self::OutOfMemory => "out of memory",
        }
    }
}

pub fn decompress(input: &[u8]) -> Result<Vec<u8>, ZstdError> {
    if let Some(content_size) =
        zstd::zstd_safe::get_frame_content_size(input).map_err(|_| ZstdError::Decode)?
    {
        let content_size =
            usize::try_from(content_size).map_err(|_| ZstdError::DecompressedSizeTooLarge)?;
        if content_size > MAX_DECOMPRESSED_BYTES {
            return Err(ZstdError::DecompressedSizeTooLarge);
        }
    }

    let mut decoder = zstd::stream::read::Decoder::new(input)
        .map_err(|_| ZstdError::Decode)?
        .single_frame();
    let mut output = Vec::new();
    let mut buffer = [0u8; READ_BUFFER_BYTES];

    loop {
        let read = decoder.read(&mut buffer).map_err(|_| ZstdError::Decode)?;
        if read == 0 {
            return Ok(output);
        }
        let next_len = output
            .len()
            .checked_add(read)
            .ok_or(ZstdError::DecompressedSizeTooLarge)?;
        if next_len > MAX_DECOMPRESSED_BYTES {
            return Err(ZstdError::DecompressedSizeTooLarge);
        }
        output
            .try_reserve(read)
            .map_err(|_| ZstdError::OutOfMemory)?;
        output.extend_from_slice(&buffer[..read]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decompresses_a_zstd_frame() {
        let input = b"hello from fluxcore";
        let compressed = zstd::stream::encode_all(input.as_slice(), 1).unwrap();
        assert_eq!(decompress(&compressed).unwrap(), input);
    }

    #[test]
    fn rejects_invalid_zstd() {
        assert!(matches!(decompress(b"not zstd"), Err(ZstdError::Decode)));
    }

    #[test]
    fn rejects_frames_over_the_decompressed_limit() {
        let input = vec![b'x'; MAX_DECOMPRESSED_BYTES + 1];
        let compressed = zstd::stream::encode_all(input.as_slice(), 1).unwrap();

        assert!(matches!(
            decompress(&compressed),
            Err(ZstdError::DecompressedSizeTooLarge)
        ));
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

pub const STOLEN_BYTES: usize = 16;

pub const NOP: u32 = 0xD503_201F;

pub const LDR_X16_PC8: u32 = 0x5800_0050;
pub const BR_X16: u32 = 0xD61F_0200;
pub const BLR_X16: u32 = 0xD63F_0200;

pub fn is_b(insn: u32) -> bool {
    (insn & 0xFC00_0000) == 0x1400_0000
}

pub fn is_bl(insn: u32) -> bool {
    (insn & 0xFC00_0000) == 0x9400_0000
}

pub fn needs_absolute_island(insn: u32) -> bool {
    is_b(insn) || is_bl(insn)
}

pub fn branch_target(insn: u32, src_pc: u64) -> Option<u64> {
    if !is_b(insn) && !is_bl(insn) {
        return None;
    }
    let imm26 = (insn & 0x03FF_FFFF) as i32;
    let off = ((imm26 << 6) >> 6) as i64 * 4;
    Some((src_pc as i64 + off) as u64)
}

pub fn encode_imm26(byte_off: i64) -> Option<u32> {
    if byte_off & 0b11 != 0 {
        return None;
    }
    let words = byte_off >> 2;
    if !(-(1 << 25)..(1 << 25)).contains(&words) {
        return None;
    }
    Some((words as u32) & 0x03FF_FFFF)
}

pub fn append_abs_branch(out: &mut Vec<u8>, addr: u64, link: bool) {
    let branch = if link { BLR_X16 } else { BR_X16 };
    out.extend_from_slice(&LDR_X16_PC8.to_le_bytes());
    out.extend_from_slice(&branch.to_le_bytes());
    out.extend_from_slice(&addr.to_le_bytes());
}

pub fn adrp_target(insn: u32, src_pc: u64) -> Option<u64> {
    if (insn & 0x9F00_0000) != 0x9000_0000 {
        return None;
    }
    let immlo = ((insn >> 29) & 0x3) as i64;
    let immhi = ((insn >> 5) & 0x7FFFF) as i64;
    let raw = (immhi << 2) | immlo;
    let imm21 = (raw << 43) >> 43;
    let page = (src_pc & !0xFFF) as i64 + imm21 * 4096;
    Some(page as u64)
}

fn ldr_unsigned_64(insn: u32) -> Option<(u32, u32, u64)> {
    if (insn & 0xFFC0_0000) != 0xF940_0000 {
        return None;
    }
    let imm12 = ((insn >> 10) & 0xFFF) as u64;
    let rn = (insn >> 5) & 0x1F;
    let rt = insn & 0x1F;
    Some((rt, rn, imm12 * 8))
}

fn br_register(insn: u32) -> Option<u32> {
    if (insn & 0xFFFF_FC1F) != 0xD61F_0000 {
        return None;
    }
    Some((insn >> 5) & 0x1F)
}

pub unsafe fn import_thunk_target(prologue: &[u8], src_base: u64) -> Option<u64> {
    if prologue.len() < 12 {
        return None;
    }
    let adrp = u32::from_le_bytes(prologue[0..4].try_into().ok()?);
    let ldr = u32::from_le_bytes(prologue[4..8].try_into().ok()?);
    let br = u32::from_le_bytes(prologue[8..12].try_into().ok()?);

    let adrp_reg = adrp & 0x1F;
    let page = adrp_target(adrp, src_base)?;
    let (ldr_rt, ldr_rn, offset) = ldr_unsigned_64(ldr)?;
    let br_rn = br_register(br)?;
    if adrp_reg != ldr_rn || ldr_rt != br_rn {
        return None;
    }
    let pointer_addr = page.checked_add(offset)?;
    let target = unsafe { core::ptr::read_unaligned(pointer_addr as *const u64) };
    (target != 0).then_some(target)
}

pub fn emit_branch_to_island(insn: u32, dst_pc: u64, island_addr: u64) -> Option<u32> {
    let link = is_bl(insn);
    let off = island_addr as i64 - dst_pc as i64;
    let imm = encode_imm26(off)?;
    let opc = if link { 0x9400_0000 } else { 0x1400_0000 };
    Some(opc | imm)
}

pub fn island_for_branch(insn: u32, src_pc: u64) -> Option<Vec<u8>> {
    let target = branch_target(insn, src_pc)?;
    let mut bytes = Vec::new();
    append_abs_branch(&mut bytes, target, is_bl(insn));
    Some(bytes)
}

pub fn relocate_instruction(insn: u32, src_pc: u64, dst_pc: u64) -> Option<u32> {
    if (insn & 0x9F00_0000) == 0x9000_0000 {
        return relocate_adr(insn, src_pc, dst_pc, true);
    }
    if (insn & 0x9F00_0000) == 0x1000_0000 {
        return relocate_adr(insn, src_pc, dst_pc, false);
    }
    if is_b(insn) || is_bl(insn) {
        let target = branch_target(insn, src_pc)?;
        let off = target as i64 - dst_pc as i64;
        let imm = encode_imm26(off)?;
        return Some((insn & 0xFC00_0000) | imm);
    }
    if (insn & 0xFF00_0010) == 0x5400_0000 {
        return relocate_imm19_at5(insn, src_pc, dst_pc);
    }
    if (insn & 0x7F00_0000) == 0x3400_0000 {
        return relocate_imm19_at5(insn, src_pc, dst_pc);
    }
    if (insn & 0x7F00_0000) == 0x3600_0000 {
        return relocate_tbz(insn, src_pc, dst_pc);
    }
    if (insn & 0x3B00_0000) == 0x1800_0000 {
        return relocate_imm19_at5(insn, src_pc, dst_pc);
    }
    Some(insn)
}

fn relocate_adr(insn: u32, src_pc: u64, dst_pc: u64, page: bool) -> Option<u32> {
    let immlo = ((insn >> 29) & 0x3) as i64;
    let immhi = ((insn >> 5) & 0x7FFFF) as i64;
    let raw = (immhi << 2) | immlo;
    let imm21 = (raw << 43) >> 43;
    let (src_ref, dst_ref, scale) = if page {
        (src_pc & !0xFFF, dst_pc & !0xFFF, 4096i64)
    } else {
        (src_pc, dst_pc, 1i64)
    };
    let target = src_ref as i64 + imm21 * scale;
    let new_off = target - dst_ref as i64;
    if scale != 1 && new_off & 0xFFF != 0 {
        return None;
    }
    let scaled = new_off / scale;
    if !(-(1 << 20)..(1 << 20)).contains(&scaled) {
        return None;
    }
    let new_raw = (scaled as u32) & 0x1F_FFFF;
    let new_immlo = (new_raw & 0x3) << 29;
    let new_immhi = ((new_raw >> 2) & 0x7FFFF) << 5;
    Some((insn & 0x9F00_001F) | new_immlo | new_immhi)
}

fn relocate_imm19_at5(insn: u32, src_pc: u64, dst_pc: u64) -> Option<u32> {
    let imm19 = ((insn >> 5) & 0x7FFFF) as i64;
    let off = ((imm19 << 45) >> 45) * 4;
    let target = src_pc as i64 + off;
    let new_off = target - dst_pc as i64;
    if new_off & 0b11 != 0 {
        return None;
    }
    let words = new_off >> 2;
    if !(-(1 << 18)..(1 << 18)).contains(&words) {
        return None;
    }
    let new_imm19 = ((words as u32) & 0x7FFFF) << 5;
    Some((insn & !(0x7FFFF << 5)) | new_imm19)
}

fn relocate_tbz(insn: u32, src_pc: u64, dst_pc: u64) -> Option<u32> {
    let imm14 = ((insn >> 5) & 0x3FFF) as i64;
    let off = ((imm14 << 50) >> 50) * 4;
    let target = src_pc as i64 + off;
    let new_off = target - dst_pc as i64;
    if new_off & 0b11 != 0 {
        return None;
    }
    let words = new_off >> 2;
    if !(-(1 << 13)..(1 << 13)).contains(&words) {
        return None;
    }
    let new_imm14 = ((words as u32) & 0x3FFF) << 5;
    Some((insn & !(0x3FFF << 5)) | new_imm14)
}

pub fn assemble_trampoline(
    prologue: &[u8],
    src_base: u64,
    dst_base: u64,
    resume: u64,
) -> Option<Vec<u8>> {
    if !prologue.len().is_multiple_of(4) {
        return None;
    }
    let count = prologue.len() / 4;
    const RETURN_BRANCH_BYTES: usize = 16;
    const ISLAND_BYTES: usize = 16;

    let islands_base = dst_base + (count * 4) as u64 + RETURN_BRANCH_BYTES as u64;

    let mut prologue_out: Vec<u8> = Vec::with_capacity(count * 4);
    let mut islands_out: Vec<u8> = Vec::new();
    let mut next_island = islands_base;

    for i in 0..count {
        let insn = u32::from_le_bytes(prologue[i * 4..i * 4 + 4].try_into().ok()?);
        let src_pc = src_base + (i * 4) as u64;
        let dst_pc = dst_base + (i * 4) as u64;
        if needs_absolute_island(insn) {
            let island_addr = next_island;
            next_island += ISLAND_BYTES as u64;
            let relocated = emit_branch_to_island(insn, dst_pc, island_addr)?;
            prologue_out.extend_from_slice(&relocated.to_le_bytes());
            let island = island_for_branch(insn, src_pc)?;
            debug_assert_eq!(island.len(), ISLAND_BYTES);
            islands_out.extend_from_slice(&island);
        } else {
            let relocated = relocate_instruction(insn, src_pc, dst_pc)?;
            prologue_out.extend_from_slice(&relocated.to_le_bytes());
        }
    }

    let mut out = prologue_out;
    append_abs_branch(&mut out, resume, false);
    out.extend_from_slice(&islands_out);
    Some(out)
}

pub fn relocated_prologue(prologue: &[u8], src_base: u64, dst_base: u64) -> Option<Vec<u8>> {
    let count = prologue.len() / 4;
    let body = assemble_trampoline(prologue, src_base, dst_base, src_base + STOLEN_BYTES as u64)?;
    Some(body[..count * 4].to_vec())
}

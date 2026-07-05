// SPDX-License-Identifier: AGPL-3.0-or-later

#[path = "../src/arm64_reloc.rs"]
mod arm64_reloc;

use arm64_reloc::*;

fn adr(rd: u32, imm21: i32) -> u32 {
    let raw = (imm21 as u32) & 0x1F_FFFF;
    let immlo = (raw & 0x3) << 29;
    let immhi = ((raw >> 2) & 0x7FFFF) << 5;
    0x1000_0000 | immlo | immhi | (rd & 0x1F)
}
fn adrp(rd: u32, imm21: i32) -> u32 {
    let raw = (imm21 as u32) & 0x1F_FFFF;
    let immlo = (raw & 0x3) << 29;
    let immhi = ((raw >> 2) & 0x7FFFF) << 5;
    0x9000_0000 | immlo | immhi | (rd & 0x1F)
}
fn b(off_words: i32) -> u32 {
    0x1400_0000 | ((off_words as u32) & 0x03FF_FFFF)
}
fn bl(off_words: i32) -> u32 {
    0x9400_0000 | ((off_words as u32) & 0x03FF_FFFF)
}
fn bcond(cond: u32, off_words: i32) -> u32 {
    0x5400_0000 | (((off_words as u32) & 0x7FFFF) << 5) | (cond & 0xF)
}
fn cbz(rt: u32, off_words: i32) -> u32 {
    0xB400_0000 | (((off_words as u32) & 0x7FFFF) << 5) | (rt & 0x1F)
}
fn tbz(rt: u32, bit: u32, off_words: i32) -> u32 {
    let b5 = (bit & 0x20) << (31 - 5);
    let b40 = (bit & 0x1F) << 19;
    0x3600_0000 | b5 | b40 | (((off_words as u32) & 0x3FFF) << 5) | (rt & 0x1F)
}
fn ldr_lit(rt: u32, off_words: i32) -> u32 {
    0x5800_0000 | (((off_words as u32) & 0x7FFFF) << 5) | (rt & 0x1F)
}

fn adr_target(insn: u32, pc: u64, page: bool) -> u64 {
    let immlo = ((insn >> 29) & 0x3) as i64;
    let immhi = ((insn >> 5) & 0x7FFFF) as i64;
    let raw = (immhi << 2) | immlo;
    let imm21 = (raw << 43) >> 43;
    if page {
        ((pc & !0xFFF) as i64 + imm21 * 4096) as u64
    } else {
        (pc as i64 + imm21) as u64
    }
}
fn imm19_target(insn: u32, pc: u64) -> u64 {
    let imm19 = ((insn >> 5) & 0x7FFFF) as i64;
    let off = ((imm19 << 45) >> 45) * 4;
    (pc as i64 + off) as u64
}
fn imm14_target(insn: u32, pc: u64) -> u64 {
    let imm14 = ((insn >> 5) & 0x3FFF) as i64;
    let off = ((imm14 << 50) >> 50) * 4;
    (pc as i64 + off) as u64
}

#[test]
fn non_pc_relative_copied_verbatim() {
    let stp = 0xA9BF_7BFD;
    assert_eq!(relocate_instruction(stp, 0x1000, 0x9000), Some(stp));
    let mov = 0xAA01_03E0;
    assert_eq!(relocate_instruction(mov, 0x1000, 0x9000), Some(mov));
    let sub = 0xD100_83FF;
    assert_eq!(relocate_instruction(sub, 0x1000, 0x9000), Some(sub));
    let mov_fp_sp = 0x9100_03FD;
    assert_eq!(
        relocate_instruction(mov_fp_sp, 0x1000, 0x9000),
        Some(mov_fp_sp)
    );
}

#[test]
fn adr_relocates_to_same_target() {
    let src_pc = 0x140_0010_0000u64;
    let dst_pc = 0x140_0010_8000u64;
    let insn = adr(0, 0x4000);
    let original = adr_target(insn, src_pc, false);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(adr_target(reloc, dst_pc, false), original);
    assert_eq!(reloc & 0x1F, 0);
}

#[test]
fn adr_negative_offset() {
    let src_pc = 0x140_0010_0000u64;
    let dst_pc = 0x140_0010_0010u64;
    let insn = adr(5, -0x100);
    let original = adr_target(insn, src_pc, false);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(adr_target(reloc, dst_pc, false), original);
    assert_eq!(reloc & 0x1F, 5);
}

#[test]
fn adr_out_of_range_refused() {
    let src_pc = 0x0000_0000_0000u64;
    let dst_pc = 0x0000_0080_0000u64;
    let insn = adr(0, 0x1000);
    assert_eq!(relocate_instruction(insn, src_pc, dst_pc), None);
}

#[test]
fn adrp_relocates_to_same_page() {
    let src_pc = 0x140_0010_0000u64;
    let dst_pc = 0x140_0030_0000u64;
    let insn = adrp(9, 0x10);
    let original = adr_target(insn, src_pc, true);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(adr_target(reloc, dst_pc, true), original);
    assert_eq!(reloc & 0x1F, 9);
    assert_eq!(reloc & 0x9F00_0000, 0x9000_0000);
}

#[test]
fn adrp_negative() {
    let src_pc = 0x140_0090_0000u64;
    let dst_pc = 0x140_0050_0000u64;
    let insn = adrp(1, -0x20);
    let original = adr_target(insn, src_pc, true);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(adr_target(reloc, dst_pc, true), original);
}

#[test]
fn bcond_relocates() {
    let src_pc = 0x10_0000u64;
    let dst_pc = 0x12_0000u64;
    let insn = bcond(0x0, 0x40);
    let original = imm19_target(insn, src_pc);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(imm19_target(reloc, dst_pc), original);
    assert_eq!(reloc & 0xF, 0x0);
}

#[test]
fn bcond_out_of_range_refused() {
    let src_pc = 0x0u64;
    let dst_pc = 0x20_0000u64;
    let insn = bcond(0x1, 0x10);
    assert_eq!(relocate_instruction(insn, src_pc, dst_pc), None);
}

#[test]
fn cbz_relocates() {
    let src_pc = 0x10_0000u64;
    let dst_pc = 0x10_8000u64;
    let insn = cbz(3, -0x20);
    let original = imm19_target(insn, src_pc);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(imm19_target(reloc, dst_pc), original);
    assert_eq!(reloc & 0x1F, 3);
    assert_eq!(reloc & 0x8000_0000, 0x8000_0000);
}

#[test]
fn tbz_relocates() {
    let src_pc = 0x10_0000u64;
    let dst_pc = 0x10_1000u64;
    let insn = tbz(7, 5, 0x10);
    let original = imm14_target(insn, src_pc);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(imm14_target(reloc, dst_pc), original);
    assert_eq!(reloc & 0x1F, 7);
}

#[test]
fn tbz_out_of_range_refused() {
    let src_pc = 0x0u64;
    let dst_pc = 0x1_0000u64;
    let insn = tbz(0, 1, 0x8);
    assert_eq!(relocate_instruction(insn, src_pc, dst_pc), None);
}

#[test]
fn ldr_literal_relocates() {
    let src_pc = 0x20_0000u64;
    let dst_pc = 0x20_4000u64;
    let insn = ldr_lit(2, 0x100);
    let original = imm19_target(insn, src_pc);
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(imm19_target(reloc, dst_pc), original);
    assert_eq!(reloc & 0x1F, 2);
}

#[test]
fn direct_b_relocation_in_range() {
    let src_pc = 0x10_0000u64;
    let dst_pc = 0x14_0000u64;
    let insn = b(0x100);
    let target = branch_target(insn, src_pc).unwrap();
    let reloc = relocate_instruction(insn, src_pc, dst_pc).expect("in range");
    assert_eq!(branch_target(reloc, dst_pc).unwrap(), target);
}

#[test]
fn branch_target_decode() {
    let pc = 0x10_0000u64;
    assert_eq!(branch_target(b(4), pc), Some(pc + 16));
    assert_eq!(branch_target(b(-4), pc), Some(pc - 16));
    assert_eq!(branch_target(bl(1), pc), Some(pc + 4));
}

#[test]
fn abs_branch_encoding() {
    let mut bytes = Vec::new();
    append_abs_branch(&mut bytes, 0x1234_5678_9ABC_DEF0, false);
    assert_eq!(bytes.len(), 16);
    assert_eq!(
        u32::from_le_bytes(bytes[0..4].try_into().unwrap()),
        LDR_X16_PC8
    );
    assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), BR_X16);
    assert_eq!(
        u64::from_le_bytes(bytes[8..16].try_into().unwrap()),
        0x1234_5678_9ABC_DEF0
    );
    let mut linked = Vec::new();
    append_abs_branch(&mut linked, 0xDEAD_BEEF, true);
    assert_eq!(
        u32::from_le_bytes(linked[4..8].try_into().unwrap()),
        BLR_X16
    );
}

#[test]
fn classify_branches() {
    assert!(is_b(b(1)));
    assert!(!is_bl(b(1)));
    assert!(is_bl(bl(1)));
    assert!(!is_b(bl(1)));
    assert!(needs_absolute_island(b(1)));
    assert!(needs_absolute_island(bl(1)));
    assert!(!needs_absolute_island(adr(0, 1)));
    assert!(!needs_absolute_island(NOP));
}

#[test]
fn assemble_trampoline_relocates_prologue() {
    let stp = 0xA9BF_7BFDu32;
    let mov = 0x9100_03FDu32;
    let adrp_insn = adrp(8, 0x20);
    let mut prologue = Vec::new();
    for insn in [stp, mov, adrp_insn, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x140_0010_0000u64;
    let dst_base = 0x140_0030_0000u64;
    let resume = src_base + STOLEN_BYTES as u64;
    let body = assemble_trampoline(&prologue, src_base, dst_base, resume).expect("relocatable");
    assert_eq!(body.len(), 32);
    assert_eq!(u32::from_le_bytes(body[0..4].try_into().unwrap()), stp);
    assert_eq!(u32::from_le_bytes(body[4..8].try_into().unwrap()), mov);
    assert_eq!(u32::from_le_bytes(body[12..16].try_into().unwrap()), NOP);
    let orig_target = adr_target(adrp_insn, src_base + 8, true);
    let reloc_adrp = u32::from_le_bytes(body[8..12].try_into().unwrap());
    assert_eq!(adr_target(reloc_adrp, dst_base + 8, true), orig_target);
    assert_eq!(
        u32::from_le_bytes(body[16..20].try_into().unwrap()),
        LDR_X16_PC8
    );
    assert_eq!(u32::from_le_bytes(body[20..24].try_into().unwrap()), BR_X16);
    assert_eq!(u64::from_le_bytes(body[24..32].try_into().unwrap()), resume);
}

#[test]
fn assemble_trampoline_promotes_leading_branch() {
    let lead_b = b(0x4000);
    let mut prologue = Vec::new();
    for insn in [lead_b, NOP, NOP, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x140_0010_0000u64;
    let dst_base = 0x0000_7000_0000u64;
    let resume = src_base + STOLEN_BYTES as u64;
    let body = assemble_trampoline(&prologue, src_base, dst_base, resume).expect("island path");
    assert_eq!(body.len(), 48);
    let first = u32::from_le_bytes(body[0..4].try_into().unwrap());
    assert!(is_b(first));
    let island_addr = branch_target(first, dst_base).unwrap();
    assert_eq!(island_addr, dst_base + 16 + 16);
    let original_b_target = branch_target(lead_b, src_base).unwrap();
    assert_eq!(
        u32::from_le_bytes(body[32..36].try_into().unwrap()),
        LDR_X16_PC8
    );
    assert_eq!(u32::from_le_bytes(body[36..40].try_into().unwrap()), BR_X16);
    assert_eq!(
        u64::from_le_bytes(body[40..48].try_into().unwrap()),
        original_b_target
    );
}

#[test]
fn assemble_trampoline_promotes_leading_bl_with_blr() {
    let lead_bl = bl(0x100);
    let mut prologue = Vec::new();
    for insn in [lead_bl, NOP, NOP, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x140_0010_0000u64;
    let dst_base = 0x0000_7000_0000u64;
    let resume = src_base + STOLEN_BYTES as u64;
    let body = assemble_trampoline(&prologue, src_base, dst_base, resume).expect("island path");
    assert_eq!(body.len(), 48);
    let first = u32::from_le_bytes(body[0..4].try_into().unwrap());
    assert!(is_bl(first));
    let original = branch_target(lead_bl, src_base).unwrap();
    assert_eq!(
        u32::from_le_bytes(body[36..40].try_into().unwrap()),
        BLR_X16
    );
    assert_eq!(
        u64::from_le_bytes(body[40..48].try_into().unwrap()),
        original
    );
}

#[test]
fn assemble_trampoline_two_islands() {
    let b0 = b(0x10);
    let bl1 = bl(0x20);
    let mut prologue = Vec::new();
    for insn in [b0, NOP, bl1, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x140_0010_0000u64;
    let dst_base = 0x0000_7000_0000u64;
    let resume = src_base + STOLEN_BYTES as u64;
    let body = assemble_trampoline(&prologue, src_base, dst_base, resume).expect("islands");
    assert_eq!(body.len(), 64);
    let first = u32::from_le_bytes(body[0..4].try_into().unwrap());
    let third = u32::from_le_bytes(body[8..12].try_into().unwrap());
    let island0 = branch_target(first, dst_base).unwrap();
    let island1 = branch_target(third, dst_base + 8).unwrap();
    assert_eq!(island0, dst_base + 32);
    assert_eq!(island1, dst_base + 48);
    assert_eq!(
        u64::from_le_bytes(body[40..48].try_into().unwrap()),
        branch_target(b0, src_base).unwrap()
    );
    assert_eq!(
        u64::from_le_bytes(body[56..64].try_into().unwrap()),
        branch_target(bl1, src_base + 8).unwrap()
    );
}

#[test]
fn assemble_trampoline_refuses_unrelocatable_narrow_branch() {
    let cond = bcond(0x2, 0x10);
    let mut prologue = Vec::new();
    for insn in [NOP, cond, NOP, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x0u64;
    let dst_base = 0x0000_0080_0000u64;
    let resume = src_base + STOLEN_BYTES as u64;
    assert_eq!(
        assemble_trampoline(&prologue, src_base, dst_base, resume),
        None
    );
}

#[test]
fn relocated_prologue_matches_assemble_prefix() {
    let stp = 0xA9BF_7BFDu32;
    let mut prologue = Vec::new();
    for insn in [stp, NOP, NOP, NOP] {
        prologue.extend_from_slice(&insn.to_le_bytes());
    }
    let src_base = 0x140_0010_0000u64;
    let dst_base = 0x140_0030_0000u64;
    let pro = relocated_prologue(&prologue, src_base, dst_base).expect("ok");
    assert_eq!(pro.len(), 16);
    assert_eq!(u32::from_le_bytes(pro[0..4].try_into().unwrap()), stp);
}

#[test]
fn island_holds_absolute_branch_to_original_target() {
    let lead_bl = bl(0x100);
    let src_base = 0x140_0010_0000u64;
    let original_target = branch_target(lead_bl, src_base).unwrap();
    let island = island_for_branch(lead_bl, src_base).expect("island");
    assert_eq!(island.len(), 16);
    assert_eq!(
        u32::from_le_bytes(island[4..8].try_into().unwrap()),
        BLR_X16
    );
    assert_eq!(
        u64::from_le_bytes(island[8..16].try_into().unwrap()),
        original_target
    );
}

#[test]
fn stolen_bytes_is_four_instructions() {
    assert_eq!(STOLEN_BYTES, 16);
    assert_eq!(STOLEN_BYTES % 4, 0);
}

#[test]
fn encode_imm26_rejects_unaligned_and_overflow() {
    assert_eq!(encode_imm26(3), None);
    assert_eq!(encode_imm26(4), Some(1));
    assert_eq!(encode_imm26(-4), Some((-1i32 as u32) & 0x03FF_FFFF));
    assert_eq!(encode_imm26(1 << 27), None);
}

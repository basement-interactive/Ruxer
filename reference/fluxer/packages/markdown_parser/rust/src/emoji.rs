// SPDX-License-Identifier: AGPL-3.0-or-later

#[derive(Clone, Debug, Default)]
pub struct EmojiContext {
    standard: Vec<StandardEmoji>,
    shortcodes: Vec<ShortcodeEmoji>,
    skins: Vec<SkinEmoji>,
}

#[derive(Clone, Debug)]
pub struct StandardEmoji {
    pub offset: usize,
    pub len: usize,
    pub raw: String,
    pub name: String,
    pub codepoints: String,
}

#[derive(Clone, Debug)]
pub struct ShortcodeEmoji {
    pub name: String,
    pub raw: String,
    pub codepoints: String,
}

#[derive(Clone, Debug)]
pub struct SkinEmoji {
    pub name: String,
    pub tone: u8,
    pub raw: String,
    pub codepoints: String,
}

impl EmojiContext {
    pub fn parse(bytes: &str) -> Self {
        let mut context = Self::default();
        for line in bytes.lines() {
            if line.is_empty() {
                continue;
            }
            let mut parts = line.split('\t');
            match parts.next() {
                Some("S") => {
                    let Some(offset) = parts.next().and_then(|value| value.parse::<usize>().ok())
                    else {
                        continue;
                    };
                    let Some(len) = parts.next().and_then(|value| value.parse::<usize>().ok())
                    else {
                        continue;
                    };
                    let Some(raw) = parts.next() else { continue };
                    let Some(name) = parts.next() else { continue };
                    let Some(codepoints) = parts.next() else {
                        continue;
                    };
                    context.standard.push(StandardEmoji {
                        offset,
                        len,
                        raw: raw.to_owned(),
                        name: name.to_owned(),
                        codepoints: codepoints.to_owned(),
                    });
                }
                Some("C") => {
                    let Some(name) = parts.next() else { continue };
                    let Some(raw) = parts.next() else { continue };
                    let Some(codepoints) = parts.next() else {
                        continue;
                    };
                    context.shortcodes.push(ShortcodeEmoji {
                        name: name.to_owned(),
                        raw: raw.to_owned(),
                        codepoints: codepoints.to_owned(),
                    });
                }
                Some("K") => {
                    let Some(name) = parts.next() else { continue };
                    let Some(tone) = parts.next().and_then(|value| value.parse::<u8>().ok()) else {
                        continue;
                    };
                    let Some(raw) = parts.next() else { continue };
                    let Some(codepoints) = parts.next() else {
                        continue;
                    };
                    context.skins.push(SkinEmoji {
                        name: name.to_owned(),
                        tone,
                        raw: raw.to_owned(),
                        codepoints: codepoints.to_owned(),
                    });
                }
                _ => {}
            }
        }
        context
    }

    pub fn standard_at(&self, offset: usize) -> Option<&StandardEmoji> {
        self.standard.iter().find(|record| record.offset == offset)
    }

    pub fn shortcode(&self, name: &str) -> Option<&ShortcodeEmoji> {
        self.shortcodes.iter().find(|record| record.name == name)
    }

    pub fn skin(&self, name: &str, tone: u8) -> Option<&SkinEmoji> {
        self.skins
            .iter()
            .find(|record| record.tone == tone && record.name == name)
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/user/components/modals/tabs/component_gallery_tab/TypographyTab.module.css';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const THIN_DESCRIPTOR = msg({
	message: 'Thin',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const DELICATE_AND_LIGHT_TYPOGRAPHY_DESCRIPTOR = msg({
	message: 'Delicate and light typography',
	comment: 'Label in the typography tab.',
});
const EXTRA_LIGHT_DESCRIPTOR = msg({
	message: 'Extra light',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const GENTLE_AND_AIRY_TEXT_DISPLAY_DESCRIPTOR = msg({
	message: 'Gentle and airy text display',
	comment: 'Label in the typography tab.',
});
const LIGHT_DESCRIPTOR = msg({
	message: 'Light',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const SOFT_AND_EASY_READING_EXPERIENCE_DESCRIPTOR = msg({
	message: 'Soft and easy reading experience',
	comment: 'Label in the typography tab.',
});
const REGULAR_DESCRIPTOR = msg({
	message: 'Regular',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const PERFECT_FOR_EVERYDAY_CONTENT_DESCRIPTOR = msg({
	message: 'Perfect for everyday content',
	comment: 'Label in the typography tab.',
});
const TEXT_DESCRIPTOR = msg({
	message: 'Text',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const OPTIMIZED_FOR_LONGER_READING_PASSAGES_DESCRIPTOR = msg({
	message: 'Optimized for longer reading passages',
	comment: 'Label in the typography tab.',
});
const MEDIUM_DESCRIPTOR = msg({
	message: 'Medium',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const SLIGHTLY_BOLDER_EMPHASIS_DESCRIPTOR = msg({
	message: 'Slightly bolder emphasis',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const SEMI_BOLD_DESCRIPTOR = msg({
	message: 'Semi bold',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const STRONG_VISUAL_HIERARCHY_DESCRIPTOR = msg({
	message: 'Strong visual hierarchy',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const BOLD_DESCRIPTOR = msg({
	message: 'Bold',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const POWERFUL_AND_ATTENTION_GRABBING_DESCRIPTOR = msg({
	message: 'Powerful and attention-grabbing',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const CAPTION_DESCRIPTOR = msg({
	message: 'Caption',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const SMALL_DESCRIPTOR = msg({
	message: 'Small',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const BODY_DESCRIPTOR = msg({
	message: 'Body',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const LARGE_DESCRIPTOR = msg({
	message: 'Large',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const SUBTITLE_DESCRIPTOR = msg({
	message: 'Subtitle',
	comment: 'Title in the typography tab. Keep it concise.',
});
const HEADING_DESCRIPTOR = msg({
	message: 'Heading',
	comment: 'Title in the typography tab. Keep it concise.',
});
const TITLE_DESCRIPTOR = msg({
	message: 'Title',
	comment: 'Title in the typography tab. Keep it concise.',
});
const DISPLAY_DESCRIPTOR = msg({
	message: 'Display',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const NORMAL_DESCRIPTOR = msg({
	message: 'Normal',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const THIS_TEXT_DEMONSTRATES_NORMAL_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates normal styling',
	comment: 'Label in the typography tab.',
});
const ITALIC_DESCRIPTOR = msg({
	message: 'Italic',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const THIS_TEXT_DEMONSTRATES_ITALIC_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates italic styling',
	comment: 'Label in the typography tab.',
});
const THIS_TEXT_DEMONSTRATES_SEMI_BOLD_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates semi-bold styling',
	comment: 'Label in the typography tab.',
});
const SEMI_BOLD_LARGE_DESCRIPTOR = msg({
	message: 'Semi-bold large',
	comment: 'Short label in the typography tab. Keep it concise.',
});
const THIS_TEXT_DEMONSTRATES_LARGE_SEMI_BOLD_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates large semi-bold styling',
	comment: 'Label in the typography tab.',
});
const BOLD_HEADING_DESCRIPTOR = msg({
	message: 'Bold heading',
	comment: 'Title in the typography tab. Keep it concise.',
});
const THIS_TEXT_DEMONSTRATES_BOLD_HEADING_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates bold heading styling',
	comment: 'Title in the typography tab. Keep it concise.',
});
const BOLD_TITLE_DESCRIPTOR = msg({
	message: 'Bold title',
	comment: 'Title in the typography tab. Keep it concise.',
});
const THIS_TEXT_DEMONSTRATES_BOLD_TITLE_STYLING_DESCRIPTOR = msg({
	message: 'This text demonstrates bold title styling',
	comment: 'Title in the typography tab. Keep it concise.',
});
const fontSamples = [
	{
		fontFamily: 'Fluxer Sans',
		name: 'Fluxer Sans',
		sample: 'The quick brown fox jumps over the lazy dog',
		lang: 'en',
	},
	{
		fontFamily: 'IBM Plex Sans JP',
		name: 'IBM Plex Sans Japanese',
		sample: 'これは日本語のサンプルテキストです',
		lang: 'ja',
	},
	{
		fontFamily: 'IBM Plex Sans KR',
		name: 'IBM Plex Sans Korean',
		sample: '이것은 한국어 샘플 텍스트입니다',
		lang: 'ko',
	},
	{
		fontFamily: 'IBM Plex Sans SC',
		name: 'IBM Plex Sans Simplified Chinese',
		sample: '这是简体中文的示例文本',
		lang: 'zh-CN',
	},
	{
		fontFamily: 'IBM Plex Sans TC',
		name: 'IBM Plex Sans Traditional Chinese',
		sample: '這是繁體中文的示例文本',
		lang: 'zh-TW',
	},
	{
		fontFamily: 'Fluxer Sans Arabic',
		name: 'Fluxer Sans Arabic',
		sample: 'هذه عينة نصية باللغة العربية',
		lang: 'ar',
		rtl: true,
	},
	{
		fontFamily: 'Fluxer Sans Hebrew',
		name: 'Fluxer Sans Hebrew',
		sample: 'זוהי דוגמה לטקסט בעברית',
		lang: 'he',
	},
	{
		fontFamily: 'Fluxer Sans Devanagari',
		name: 'Fluxer Sans Devanagari',
		sample: 'यह हिंदी का नमूना पाठ है',
		lang: 'hi',
	},
	{
		fontFamily: 'Fluxer Sans Thai',
		name: 'Fluxer Sans Thai',
		sample: 'นี่คือข้อความตัวอย่างภาษาไทย',
		lang: 'th',
	},
	{
		fontFamily: 'Fluxer Sans Thai Looped',
		name: 'Fluxer Sans Thai Looped',
		sample: 'นี่คือข้อความตัวอย่างภาษาไทยแบบ Loop',
		lang: 'th',
	},
];
const weightExamples: Array<{weight: number; label: MessageDescriptor; text: MessageDescriptor}> = [
	{weight: 100, label: THIN_DESCRIPTOR, text: DELICATE_AND_LIGHT_TYPOGRAPHY_DESCRIPTOR},
	{weight: 200, label: EXTRA_LIGHT_DESCRIPTOR, text: GENTLE_AND_AIRY_TEXT_DISPLAY_DESCRIPTOR},
	{weight: 300, label: LIGHT_DESCRIPTOR, text: SOFT_AND_EASY_READING_EXPERIENCE_DESCRIPTOR},
	{weight: 400, label: REGULAR_DESCRIPTOR, text: PERFECT_FOR_EVERYDAY_CONTENT_DESCRIPTOR},
	{weight: 450, label: TEXT_DESCRIPTOR, text: OPTIMIZED_FOR_LONGER_READING_PASSAGES_DESCRIPTOR},
	{weight: 500, label: MEDIUM_DESCRIPTOR, text: SLIGHTLY_BOLDER_EMPHASIS_DESCRIPTOR},
	{weight: 600, label: SEMI_BOLD_DESCRIPTOR, text: STRONG_VISUAL_HIERARCHY_DESCRIPTOR},
	{weight: 700, label: BOLD_DESCRIPTOR, text: POWERFUL_AND_ATTENTION_GRABBING_DESCRIPTOR},
];
const scaleExamples: Array<{size: string; label: MessageDescriptor; weight: number}> = [
	{size: '12px', label: CAPTION_DESCRIPTOR, weight: 400},
	{size: '14px', label: SMALL_DESCRIPTOR, weight: 400},
	{size: '16px', label: BODY_DESCRIPTOR, weight: 400},
	{size: '18px', label: LARGE_DESCRIPTOR, weight: 500},
	{size: '20px', label: SUBTITLE_DESCRIPTOR, weight: 500},
	{size: '24px', label: HEADING_DESCRIPTOR, weight: 600},
	{size: '30px', label: TITLE_DESCRIPTOR, weight: 700},
	{size: '36px', label: DISPLAY_DESCRIPTOR, weight: 700},
];
const contrastExamples: Array<{
	weight: number;
	size: string;
	style: MessageDescriptor;
	description: MessageDescriptor;
	italic?: boolean;
}> = [
	{weight: 400, size: '16px', style: NORMAL_DESCRIPTOR, description: THIS_TEXT_DEMONSTRATES_NORMAL_STYLING_DESCRIPTOR},
	{
		weight: 400,
		size: '16px',
		style: ITALIC_DESCRIPTOR,
		description: THIS_TEXT_DEMONSTRATES_ITALIC_STYLING_DESCRIPTOR,
		italic: true,
	},
	{
		weight: 600,
		size: '16px',
		style: SEMI_BOLD_DESCRIPTOR,
		description: THIS_TEXT_DEMONSTRATES_SEMI_BOLD_STYLING_DESCRIPTOR,
	},
	{
		weight: 600,
		size: '18px',
		style: SEMI_BOLD_LARGE_DESCRIPTOR,
		description: THIS_TEXT_DEMONSTRATES_LARGE_SEMI_BOLD_STYLING_DESCRIPTOR,
	},
	{
		weight: 700,
		size: '20px',
		style: BOLD_HEADING_DESCRIPTOR,
		description: THIS_TEXT_DEMONSTRATES_BOLD_HEADING_STYLING_DESCRIPTOR,
	},
	{
		weight: 700,
		size: '24px',
		style: BOLD_TITLE_DESCRIPTOR,
		description: THIS_TEXT_DEMONSTRATES_BOLD_TITLE_STYLING_DESCRIPTOR,
	},
];
export const TypographyTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	return (
		<div
			className={styles.container}
			data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.container"
		>
			<div data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div">
				<h3
					className={styles.subheading}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.subheading"
				>
					<Trans>Language support</Trans>
				</h3>
				<div className={styles.grid} data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.grid">
					{fontSamples.map((font) => (
						<div
							key={font.fontFamily}
							className={styles.card}
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.card"
						>
							<div
								className={styles.cardHeader}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.card-header"
							>
								<div
									className={styles.cardInfo}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.card-info"
								>
									<span
										className={styles.fontName}
										data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.font-name"
									>
										{font.name}
									</span>
									<span
										className={styles.langCode}
										data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.lang-code"
									>
										{font.lang.toUpperCase()}
									</span>
								</div>
								<span
									className={styles.fontFamily}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.font-family"
								>
									{font.fontFamily}
								</span>
							</div>
							<div
								className={styles.sampleText}
								style={{
									fontFamily: `"${font.fontFamily}", var(--font-sans)`,
									fontSize: '16px',
									textAlign: font.rtl ? 'right' : 'left',
								}}
								lang={font.lang}
								dir={font.rtl ? 'rtl' : 'ltr'}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.sample-text"
							>
								{font.sample}
							</div>
						</div>
					))}
				</div>
			</div>
			<div data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div--2">
				<h3
					className={styles.subheading}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.subheading--2"
				>
					<Trans>Font weights</Trans>
				</h3>
				<div
					className={styles.codeGrid}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.code-grid"
				>
					{weightExamples.map((example) => (
						<div
							key={example.weight}
							className={styles.weightCard}
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.weight-card"
						>
							<div
								className={styles.cardHeader}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.card-header--2"
							>
								<span
									className={styles.weightLabel}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.weight-label"
								>
									{i18n._(example.label)}
								</span>
								<span
									className={styles.weightValue}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.weight-value"
								>
									{example.weight}
								</span>
							</div>
							<div
								style={{
									fontWeight: example.weight,
									fontFamily: 'var(--font-sans)',
									lineHeight: 1.4,
								}}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div--3"
							>
								{i18n._(example.text)}
							</div>
							<div
								className={styles.weightItalic}
								style={{
									fontWeight: example.weight,
									fontFamily: 'var(--font-sans)',
									fontSize: '14px',
								}}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.weight-italic"
							>
								<Trans>Italic style demonstration</Trans>
							</div>
						</div>
					))}
				</div>
			</div>
			<div data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div--4">
				<h3
					className={styles.subheading}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.subheading--3"
				>
					<Trans>Type scale</Trans>
				</h3>
				<div
					className={styles.scaleList}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-list"
				>
					{scaleExamples.map((example) => (
						<div
							key={example.size}
							className={styles.scaleItem}
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-item"
						>
							<div
								className={styles.scaleSize}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-size"
							>
								<span
									className={styles.fontFamily}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.font-family--2"
								>
									{example.size}
								</span>
							</div>
							<div
								className={styles.scaleLabel}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-label"
							>
								<span
									className={styles.scaleLabelText}
									data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-label-text"
								>
									{i18n._(example.label)}
								</span>
							</div>
							<div
								className={styles.scaleSample}
								style={{
									fontSize: example.size,
									fontWeight: example.weight,
									fontFamily: 'var(--font-sans)',
									lineHeight: 1.3,
								}}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.scale-sample"
							>
								<Trans>Typography scale demonstration</Trans>
							</div>
						</div>
					))}
				</div>
			</div>
			<div data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div--5">
				<h3
					className={styles.subheading}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.subheading--4"
				>
					<Trans>Style variations</Trans>
				</h3>
				<div
					className={styles.grid}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.grid--2"
				>
					{contrastExamples.map((example, index) => (
						<div
							key={index}
							className={styles.weightCard}
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.weight-card--2"
						>
							<div
								className={styles.styleLabel}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.style-label"
							>
								{i18n._(example.style)}
							</div>
							<div
								className={example.italic ? styles.italic : ''}
								style={{
									fontSize: example.size,
									fontWeight: example.weight,
									fontFamily: 'var(--font-sans)',
									lineHeight: 1.3,
								}}
								data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.italic"
							>
								{i18n._(example.description)}
							</div>
						</div>
					))}
				</div>
			</div>
			<div data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.div--23">
				<h3
					className={styles.subheading}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.subheading--6"
				>
					<Trans>Multilingual content</Trans>
				</h3>
				<div
					className={styles.multilingualCard}
					data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-card"
				>
					<div
						className={styles.multilingualList}
						style={{fontFamily: 'var(--font-sans)', lineHeight: 1.6}}
						data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-list"
					>
						<div
							className={styles.multilingualItem}
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong">
								English:
							</strong>{' '}
							Welcome to Fluxer's typography showcase
						</div>
						<div
							className={styles.multilingualItem}
							lang="ja"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--2"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--2">
								日本語:
							</strong>{' '}
							フラクサーのタイポグラフィショーケースへようこそ
						</div>
						<div
							className={styles.multilingualItem}
							lang="ko"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--3"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--3">
								한국어:
							</strong>{' '}
							Fluxer의 타이포그래피 쇼케이스에 오신 것을 환영합니다
						</div>
						<div
							className={styles.multilingualItem}
							lang="zh-CN"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--4"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--4">
								简体中文:
							</strong>{' '}
							欢迎来到 Fluxer 的字体展示
						</div>
						<div
							className={styles.multilingualItem}
							lang="zh-TW"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--5"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--5">
								繁體中文:
							</strong>{' '}
							歡迎來到 Fluxer 的字體展示
						</div>
						<div
							className={styles.multilingualItem}
							lang="ar"
							dir="rtl"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--6"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--6">
								العربية:
							</strong>{' '}
							مرحباً بك في عرض طباعة Fluxer
						</div>
						<div
							className={styles.multilingualItem}
							lang="he"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--7"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--7">
								עברית:
							</strong>{' '}
							ברוכים הבאים לתצוגת הטיפוגרפיה של Fluxer
						</div>
						<div
							className={styles.multilingualItem}
							lang="hi"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--8"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--8">
								हिंदी:
							</strong>{' '}
							Fluxer के टाइपोग्राफी शोकेस में आपका स्वागत है
						</div>
						<div
							className={styles.multilingualItem}
							lang="th"
							data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.multilingual-item--9"
						>
							<strong data-flx="user.component-gallery-tab.typography-tab.typography-tab-content.strong--9">
								ไทย:
							</strong>{' '}
							ยินดีต้อนรับสู่การจัดแสดงพิมพ์ของ Fluxer
						</div>
					</div>
				</div>
			</div>
		</div>
	);
});

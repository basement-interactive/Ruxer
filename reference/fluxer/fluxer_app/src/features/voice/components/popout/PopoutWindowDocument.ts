// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {
	UNFOCUSED_FULLY_INTERACTIVE_CLASS,
	WINDOW_FOCUS_ACTIVATION_GUARD_CLASS,
	WINDOW_FOCUSED_CLASS,
} from '@app/features/ui/utils/WindowFocusInteractionGuard';

const logger = new Logger('PopoutWindowDocument');

export const POPOUT_STYLESHEET_COPY_MAX = 256;
export const POPOUT_THEME_ATTRIBUTE_COPY_MAX = 64;
export const POPOUT_THEME_CLASS_COPY_MAX = 128;

const POPOUT_OWNED_ROOT_CLASSES = new Set([
	WINDOW_FOCUSED_CLASS,
	WINDOW_FOCUS_ACTIVATION_GUARD_CLASS,
	UNFOCUSED_FULLY_INTERACTIVE_CLASS,
]);

function splitClassNames(value: string): Array<string> {
	const trimmedValue = value.trim();
	if (!trimmedValue) return [];
	return trimmedValue.split(/\s+/).slice(0, POPOUT_THEME_CLASS_COPY_MAX);
}

function syncRootClassAttribute(sourceValue: string, targetRoot: HTMLElement): void {
	const copiedClassNames = splitClassNames(sourceValue).filter(
		(className) => !POPOUT_OWNED_ROOT_CLASSES.has(className),
	);
	const ownedClassNames = splitClassNames(targetRoot.getAttribute('class') ?? '').filter((className) =>
		POPOUT_OWNED_ROOT_CLASSES.has(className),
	);
	const nextClassName = Array.from(new Set([...copiedClassNames, ...ownedClassNames])).join(' ');
	if (nextClassName) {
		targetRoot.setAttribute('class', nextClassName);
		return;
	}
	targetRoot.removeAttribute('class');
}

function inlineStylesheetFallback(sourceLink: HTMLLinkElement, targetDocument: Document): void {
	let cssText = '';
	try {
		const rules = sourceLink.sheet?.cssRules;
		if (!rules) return;
		const ruleTexts: Array<string> = [];
		for (let index = 0; index < rules.length; index += 1) {
			ruleTexts.push(rules[index].cssText);
		}
		cssText = ruleTexts.join('\n');
	} catch (error) {
		logger.warn('Failed to inline popout stylesheet fallback', {href: sourceLink.href, error});
		return;
	}
	const styleElement = targetDocument.createElement('style');
	styleElement.textContent = cssText;
	targetDocument.head.appendChild(styleElement);
}

function copyLinkStylesheet(sourceLink: HTMLLinkElement, targetDocument: Document): void {
	const linkElement = targetDocument.createElement('link');
	linkElement.rel = 'stylesheet';
	linkElement.href = sourceLink.href;
	if (sourceLink.media) {
		linkElement.media = sourceLink.media;
	}
	linkElement.addEventListener('error', () => {
		linkElement.remove();
		inlineStylesheetFallback(sourceLink, targetDocument);
	});
	targetDocument.head.appendChild(linkElement);
}

export function copyStylesheetsIntoDocument(sourceDocument: Document, targetDocument: Document): void {
	const styleNodes = sourceDocument.querySelectorAll('link[rel="stylesheet"], style');
	const copyCount = Math.min(styleNodes.length, POPOUT_STYLESHEET_COPY_MAX);
	for (let index = 0; index < copyCount; index += 1) {
		const node = styleNodes[index];
		if (node instanceof HTMLLinkElement) {
			copyLinkStylesheet(node, targetDocument);
			continue;
		}
		const styleElement = targetDocument.createElement('style');
		styleElement.textContent = node.textContent;
		targetDocument.head.appendChild(styleElement);
	}
}

function copyStyleElement(sourceStyle: HTMLStyleElement, targetDocument: Document): HTMLStyleElement {
	const styleElement = targetDocument.createElement('style');
	styleElement.textContent = sourceStyle.textContent;
	targetDocument.head.appendChild(styleElement);
	return styleElement;
}

export function observeDocumentStylesheets(sourceDocument: Document, targetDocument: Document): () => void {
	if (typeof MutationObserver === 'undefined') {
		return () => undefined;
	}
	const mirroredStyles = new WeakMap<Node, HTMLStyleElement>();
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type === 'characterData' || mutation.target instanceof HTMLStyleElement) {
				const sourceStyle =
					mutation.target instanceof HTMLStyleElement ? mutation.target : mutation.target.parentElement;
				if (sourceStyle instanceof HTMLStyleElement) {
					const mirroredStyle = mirroredStyles.get(sourceStyle);
					if (mirroredStyle) {
						mirroredStyle.textContent = sourceStyle.textContent;
					}
				}
			}
			for (const node of Array.from(mutation.addedNodes)) {
				if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
					copyLinkStylesheet(node, targetDocument);
					continue;
				}
				if (node instanceof HTMLStyleElement) {
					mirroredStyles.set(node, copyStyleElement(node, targetDocument));
				}
			}
			for (const node of Array.from(mutation.removedNodes)) {
				const mirroredStyle = mirroredStyles.get(node);
				if (mirroredStyle) {
					mirroredStyle.remove();
					mirroredStyles.delete(node);
				}
			}
		}
	});
	observer.observe(sourceDocument.head, {childList: true, subtree: true, characterData: true});
	return () => observer.disconnect();
}

export function syncDocumentThemeAttributes(sourceDocument: Document, targetDocument: Document): void {
	const sourceRoot = sourceDocument.documentElement;
	const targetRoot = targetDocument.documentElement;
	if (!sourceRoot || !targetRoot) return;
	const seenNames = new Set<string>();
	const attributes = sourceRoot.attributes;
	const copyCount = Math.min(attributes.length, POPOUT_THEME_ATTRIBUTE_COPY_MAX);
	for (let index = 0; index < copyCount; index += 1) {
		const attribute = attributes[index];
		seenNames.add(attribute.name);
		if (attribute.name === 'class') {
			syncRootClassAttribute(attribute.value, targetRoot);
			continue;
		}
		targetRoot.setAttribute(attribute.name, attribute.value);
	}
	for (const existing of Array.from(targetRoot.attributes)) {
		if (!seenNames.has(existing.name)) {
			if (existing.name === 'class') {
				syncRootClassAttribute('', targetRoot);
				continue;
			}
			targetRoot.removeAttribute(existing.name);
		}
	}
}

export function observeDocumentThemeAttributes(sourceDocument: Document, targetDocument: Document): () => void {
	if (typeof MutationObserver === 'undefined') {
		return () => undefined;
	}
	const observer = new MutationObserver(() => {
		syncDocumentThemeAttributes(sourceDocument, targetDocument);
	});
	observer.observe(sourceDocument.documentElement, {attributes: true});
	return () => observer.disconnect();
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelSearchResults.module.css';
import {
	buildPaginationRange,
	GO_TO_PAGE_2_DESCRIPTOR,
	GO_TO_PAGE_DESCRIPTOR,
	JUMP_TO_PAGE_DESCRIPTOR,
} from '@app/features/channel/components/channel_search_results/ChannelSearchResultsShared';
import {PASSWORD_MANAGER_IGNORE_ATTRIBUTES} from '@app/features/platform/utils/PasswordManagerAutocomplete';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';
import {useEffect, useRef, useState} from 'react';

interface SearchResultsPaginationProps {
	currentPage: number;
	totalPages: number;
	visiblePageSlots: number;
	onJumpToPage: (page: number) => void;
}

export const SearchResultsPagination: React.FC<SearchResultsPaginationProps> = ({
	currentPage,
	totalPages,
	visiblePageSlots,
	onJumpToPage,
}) => {
	const {i18n} = useLingui();
	const [pageJumpValue, setPageJumpValue] = useState('');
	const [activeEllipsis, setActiveEllipsis] = useState<'left' | 'right' | null>(null);
	const ellipsisInputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		setPageJumpValue('');
		setActiveEllipsis(null);
	}, [currentPage]);
	useEffect(() => {
		if (activeEllipsis && ellipsisInputRef.current) {
			ellipsisInputRef.current.focus();
			ellipsisInputRef.current.select();
		}
	}, [activeEllipsis]);
	if (totalPages <= 1) return null;
	const paginationRange = buildPaginationRange(currentPage, totalPages, visiblePageSlots);
	return (
		<div className={styles.paginationBar} data-flx="channel.channel-search-results.render-content.pagination-bar">
			<div
				className={styles.paginationWrapper}
				data-flx="channel.channel-search-results.render-content.pagination-wrapper"
			>
				{paginationRange.map((page) => {
					if (typeof page === 'number') {
						return (
							<FocusRing
								key={page}
								offset={-2}
								ringClassName={styles.focusRingCircular}
								data-flx="channel.channel-search-results.render-content.focus-ring"
							>
								<button
									type="button"
									onClick={() => {
										if (page !== currentPage) {
											onJumpToPage(page);
											setPageJumpValue('');
											setActiveEllipsis(null);
										}
									}}
									className={clsx(styles.pageButton, page === currentPage && styles.pageButtonActive)}
									aria-current={page === currentPage ? 'page' : undefined}
									aria-label={i18n._(GO_TO_PAGE_DESCRIPTOR, {page})}
									data-flx="channel.channel-search-results.render-content.page-button"
								>
									{page}
								</button>
							</FocusRing>
						);
					}
					const side = page === 'ellipsis-left' ? 'left' : 'right';
					const isActive = activeEllipsis === side;
					if (isActive) {
						return (
							<form
								key={`ellipsis-input-${side}`}
								className={styles.pageInputForm}
								onSubmit={(e) => {
									e.preventDefault();
									const nextPage = parseInt(pageJumpValue, 10);
									if (!Number.isNaN(nextPage) && nextPage >= 1 && nextPage <= totalPages) {
										if (nextPage !== currentPage) {
											onJumpToPage(nextPage);
										}
									}
									setPageJumpValue('');
									setActiveEllipsis(null);
								}}
								data-flx="channel.channel-search-results.render-content.page-input-form.prevent-default"
							>
								<label
									htmlFor={`channel-search-pagination-input-${side}`}
									className={styles.pageInputLabel}
									data-flx="channel.channel-search-results.render-content.page-input-label"
								>
									{i18n._(GO_TO_PAGE_2_DESCRIPTOR)}
								</label>
								<FocusRing offset={-2} data-flx="channel.channel-search-results.render-content.focus-ring--2">
									<input
										id={`channel-search-pagination-input-${side}`}
										ref={ellipsisInputRef}
										type="number"
										data-flx="channel.channel-search-results.render-content.page-input.set-page-jump-value.number"
										{...PASSWORD_MANAGER_IGNORE_ATTRIBUTES}
										min={1}
										max={totalPages}
										inputMode="numeric"
										value={pageJumpValue}
										onChange={(e) => setPageJumpValue(e.target.value)}
										onBlur={() => {
											setActiveEllipsis(null);
											setPageJumpValue('');
										}}
										className={styles.pageInput}
										placeholder={side === 'left' ? '1' : totalPages.toString()}
									/>
								</FocusRing>
							</form>
						);
					}
					return (
						<FocusRing
							key={`ellipsis-${side}`}
							offset={-2}
							ringClassName={styles.focusRingCircular}
							data-flx="channel.channel-search-results.render-content.focus-ring--3"
						>
							<button
								type="button"
								onClick={() => {
									setActiveEllipsis(side);
									setPageJumpValue('');
								}}
								className={styles.ellipsisButton}
								aria-label={i18n._(JUMP_TO_PAGE_DESCRIPTOR)}
								data-flx="channel.channel-search-results.render-content.ellipsis-button.set-active-ellipsis"
							>
								&hellip;
							</button>
						</FocusRing>
					);
				})}
			</div>
		</div>
	);
};

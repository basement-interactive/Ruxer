// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {CopyLinkSection} from '@app/features/app/components/dialogs/shared/CopyLinkSection';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import styles from '@app/features/expressions/components/modals/PackInviteModal.module.css';
import {
	CLOSE_DESCRIPTOR,
	NEVER_DESCRIPTOR,
	ONE_DAY_DURATION_DESCRIPTOR,
	ONE_HOUR_DURATION_DESCRIPTOR,
	SEVEN_DAYS_DURATION_DESCRIPTOR,
	SIX_HOURS_DURATION_DESCRIPTOR,
	THIRTY_MINUTES_DURATION_DESCRIPTOR,
	TWELVE_HOURS_DURATION_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as PackInviteCommands from '@app/features/invite/commands/PackInviteCommands';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Combobox, type ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {useCopyLinkHandler} from '@app/lib/copy-link';
import type {PackType} from '@fluxer/schema/src/domains/pack/PackSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useId, useMemo, useState} from 'react';

const UNLIMITED_DESCRIPTOR = msg({
	message: 'Unlimited',
	comment: 'Option label representing an unlimited count.',
});
const MESSAGE_1_USE_DESCRIPTOR = msg({
	message: '1 use',
	comment: 'Invite link use-limit option meaning the invite can be used once.',
});
const MESSAGE_5_USES_DESCRIPTOR = msg({
	message: '5 uses',
	comment: 'Invite link use-limit option meaning the invite can be used five times.',
});
const MESSAGE_10_USES_DESCRIPTOR = msg({
	message: '10 uses',
	comment: 'Invite link use-limit option meaning the invite can be used ten times.',
});
const MESSAGE_25_USES_DESCRIPTOR = msg({
	message: '25 uses',
	comment: 'Invite link use-limit option meaning the invite can be used 25 times.',
});
const MESSAGE_50_USES_DESCRIPTOR = msg({
	message: '50 uses',
	comment: 'Invite link use-limit option meaning the invite can be used 50 times.',
});
const MESSAGE_100_USES_DESCRIPTOR = msg({
	message: '100 uses',
	comment: 'Invite link use-limit option meaning the invite can be used 100 times.',
});
const EMOJI_PACK_INVITE_DESCRIPTOR = msg({
	message: 'Emoji pack invite',
	comment: 'Modal title for the emoji pack invite share flow.',
});
const STICKER_PACK_INVITE_DESCRIPTOR = msg({
	message: 'Sticker pack invite',
	comment: 'Modal title for the sticker pack invite share flow.',
});
const SEND_A_LINK_TO_LET_OTHERS_INSTALL_YOUR_DESCRIPTOR = msg({
	message: 'Share this link — the pack installs when accepted.',
	comment: 'Description shown in the emoji pack invite modal.',
});
const SHARE_YOUR_STICKER_PACK_WITH_OTHERS_VIA_A_DESCRIPTOR = msg({
	message: 'Share your sticker pack via link.',
	comment: 'Description shown in the sticker pack invite modal.',
});
const TOGGLE_UNIQUE_INVITE_DESCRIPTOR = msg({
	message: 'Toggle unique invite',
	comment: 'Action that toggles whether the pack invite is unique to the recipient.',
});

interface PackInviteModalProps {
	packId: string;
	type: PackType;
	onCreated?: () => void;
}

export const PackInviteModal = observer(({packId, type, onCreated}: PackInviteModalProps) => {
	const {i18n} = useLingui();
	const MAX_AGE_OPTIONS: Array<ComboboxOption<string>> = useMemo(
		() => [
			{value: '0', label: i18n._(NEVER_DESCRIPTOR)},
			{value: '1800', label: i18n._(THIRTY_MINUTES_DURATION_DESCRIPTOR)},
			{value: '3600', label: i18n._(ONE_HOUR_DURATION_DESCRIPTOR)},
			{value: '21600', label: i18n._(SIX_HOURS_DURATION_DESCRIPTOR)},
			{value: '43200', label: i18n._(TWELVE_HOURS_DURATION_DESCRIPTOR)},
			{value: '86400', label: i18n._(ONE_DAY_DURATION_DESCRIPTOR)},
			{value: '604800', label: i18n._(SEVEN_DAYS_DURATION_DESCRIPTOR)},
		],
		[i18n.locale],
	);
	const MAX_USES_OPTIONS: Array<ComboboxOption<string>> = useMemo(
		() => [
			{value: '0', label: i18n._(UNLIMITED_DESCRIPTOR)},
			{value: '1', label: i18n._(MESSAGE_1_USE_DESCRIPTOR)},
			{value: '5', label: i18n._(MESSAGE_5_USES_DESCRIPTOR)},
			{value: '10', label: i18n._(MESSAGE_10_USES_DESCRIPTOR)},
			{value: '25', label: i18n._(MESSAGE_25_USES_DESCRIPTOR)},
			{value: '50', label: i18n._(MESSAGE_50_USES_DESCRIPTOR)},
			{value: '100', label: i18n._(MESSAGE_100_USES_DESCRIPTOR)},
		],
		[i18n.locale],
	);
	const [maxAge, setMaxAge] = useState('0');
	const [maxUses, setMaxUses] = useState('0');
	const [unique, setUnique] = useState(false);
	const [inviteCode, setInviteCode] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const maxAgeSelectId = useId();
	const maxUsesSelectId = useId();
	const title = type === 'emoji' ? i18n._(EMOJI_PACK_INVITE_DESCRIPTOR) : i18n._(STICKER_PACK_INVITE_DESCRIPTOR);
	const description =
		type === 'emoji'
			? i18n._(SEND_A_LINK_TO_LET_OTHERS_INSTALL_YOUR_DESCRIPTOR)
			: i18n._(SHARE_YOUR_STICKER_PACK_WITH_OTHERS_VIA_A_DESCRIPTOR);
	const inviteUrl = inviteCode ? `${RuntimeConfig.inviteEndpoint}/${inviteCode}` : '';
	const handleGenerateInvite = async () => {
		setIsCreating(true);
		try {
			const metadata = await PackInviteCommands.createInvite({
				packId,
				maxAge: parseInt(maxAge, 10),
				maxUses: parseInt(maxUses, 10),
				unique,
			});
			setInviteCode(metadata.code);
			onCreated?.();
		} finally {
			setIsCreating(false);
		}
	};
	const handleCopy = useCopyLinkHandler(inviteUrl, true);
	return (
		<Modal.Root size="small" onClose={() => ModalCommands.pop()} data-flx="expressions.pack-invite-modal.modal-root">
			<Modal.Header title={title} data-flx="expressions.pack-invite-modal.modal-header" />
			<Modal.Content data-flx="expressions.pack-invite-modal.modal-content">
				<p className={styles.description} data-flx="expressions.pack-invite-modal.description">
					{description}
				</p>
				<div className={styles.fieldGroup} data-flx="expressions.pack-invite-modal.field-group">
					<label
						htmlFor={maxAgeSelectId}
						className={styles.fieldLabel}
						data-flx="expressions.pack-invite-modal.field-label"
					>
						<Trans>Expiration</Trans>
					</label>
					<Combobox
						id={maxAgeSelectId}
						value={maxAge}
						options={MAX_AGE_OPTIONS}
						onChange={(value) => setMaxAge(value)}
						data-flx="expressions.pack-invite-modal.select.set-max-age"
					/>
				</div>
				<div className={styles.fieldGroup} data-flx="expressions.pack-invite-modal.field-group--2">
					<label
						htmlFor={maxUsesSelectId}
						className={styles.fieldLabel}
						data-flx="expressions.pack-invite-modal.field-label--2"
					>
						<Trans>Max uses</Trans>
					</label>
					<Combobox
						id={maxUsesSelectId}
						value={maxUses}
						options={MAX_USES_OPTIONS}
						onChange={(value) => setMaxUses(value)}
						data-flx="expressions.pack-invite-modal.select.set-max-uses"
					/>
				</div>
				<div className={styles.fieldGroup} data-flx="expressions.pack-invite-modal.field-group--3">
					<Switch
						label={<Trans>Unique invite</Trans>}
						value={unique}
						onChange={(value) => setUnique(value)}
						ariaLabel={i18n._(TOGGLE_UNIQUE_INVITE_DESCRIPTOR)}
						data-flx="expressions.pack-invite-modal.switch.set-unique"
					/>
					<p className={styles.helpText} data-flx="expressions.pack-invite-modal.help-text">
						<Trans>Each link works once.</Trans>
					</p>
				</div>
				{inviteCode && (
					<CopyLinkSection
						label={<Trans>Share this link</Trans>}
						value={inviteUrl}
						onCopy={handleCopy}
						placeholder={`${RuntimeConfig.inviteEndpoint}/...`}
						data-flx="expressions.pack-invite-modal.copy-link-section"
					/>
				)}
			</Modal.Content>
			<Modal.Footer data-flx="expressions.pack-invite-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="expressions.pack-invite-modal.button.pop"
				>
					{i18n._(CLOSE_DESCRIPTOR)}
				</Button>
				<Button
					onClick={handleGenerateInvite}
					submitting={isCreating}
					data-flx="expressions.pack-invite-modal.button.generate-invite"
				>
					<Trans>Generate invite</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});

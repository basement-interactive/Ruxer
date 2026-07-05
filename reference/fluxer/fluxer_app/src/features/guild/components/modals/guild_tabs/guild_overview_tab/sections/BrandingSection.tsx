// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import {GuildBannerUploadField} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/fields/GuildBannerUploadField';
import {GuildEmbedSplashUploadField} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/fields/GuildEmbedSplashUploadField';
import {GuildIconUploadField} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/fields/GuildIconUploadField';
import {GuildInviteSplashSettingsField} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/fields/GuildInviteSplashSettingsField';
import {GuildInviteSplashUploadField} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/fields/GuildInviteSplashUploadField';
import styles from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/GuildOverviewTab.module.css';
import type {GuildLike} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/GuildOverviewTypes';
import Guilds from '@app/features/guild/state/Guilds';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import {InviteAcceptModalPreview} from '@app/features/invite/components/modals/InviteAcceptModalPreview';
import {InvitePagePreviewModal} from '@app/features/invite/components/modals/InvitePagePreviewModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {GuildFeatures, type GuildSplashCardAlignmentValue} from '@fluxer/constants/src/GuildConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useCallback} from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';

const NAME_DESCRIPTOR = msg({
	message: 'Name',
	comment: 'Short label in the branding section. Keep it concise.',
});
const MY_AWESOME_COMMUNITY_DESCRIPTOR = msg({
	message: 'My awesome community',
	comment: 'Short label in the branding section. Keep it concise.',
});
const DETACHED_BANNER_DESCRIPTOR = msg({
	message: 'Detached banner',
	comment: 'Short label in the branding section. Keep it concise. Keep the tone plain and specific.',
});
const WHEN_ENABLED_THE_BANNER_APPEARS_IN_ITS_OWN_DESCRIPTOR = msg({
	message: 'Shows the banner in its own section below the community header.',
	comment: 'Description text in the branding section. Keep the tone plain and specific.',
});
export const BrandingSection: React.FC<{
	guildId: string;
	guild: GuildLike;
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
	previewIconUrl: string | null;
	setPreviewIconUrl: React.Dispatch<React.SetStateAction<string | null>>;
	hasClearedIcon: boolean;
	setHasClearedIcon: React.Dispatch<React.SetStateAction<boolean>>;
	previewBannerUrl: string | null;
	setPreviewBannerUrl: React.Dispatch<React.SetStateAction<string | null>>;
	hasClearedBanner: boolean;
	setHasClearedBanner: React.Dispatch<React.SetStateAction<boolean>>;
	bannerAspectRatio: number | undefined;
	setBannerAspectRatio: (ratio: number | undefined) => void;
	previewSplashUrl: string | null;
	setPreviewSplashUrl: React.Dispatch<React.SetStateAction<string | null>>;
	hasClearedSplash: boolean;
	setHasClearedSplash: React.Dispatch<React.SetStateAction<boolean>>;
	splashAspectRatio: number | undefined;
	setSplashAspectRatio: (ratio: number | undefined) => void;
	previewEmbedSplashUrl: string | null;
	setPreviewEmbedSplashUrl: React.Dispatch<React.SetStateAction<string | null>>;
	hasClearedEmbedSplash: boolean;
	setHasClearedEmbedSplash: React.Dispatch<React.SetStateAction<boolean>>;
	computeAspectRatioFromBase64: (dataUrl: string) => Promise<number>;
}> = (props) => {
	const {i18n} = useLingui();
	const {
		guildId,
		guild,
		form,
		canManageGuild,
		previewIconUrl,
		setPreviewIconUrl,
		hasClearedIcon,
		setHasClearedIcon,
		previewBannerUrl,
		setPreviewBannerUrl,
		hasClearedBanner,
		setHasClearedBanner,
		bannerAspectRatio,
		setBannerAspectRatio,
		previewSplashUrl,
		setPreviewSplashUrl,
		hasClearedSplash,
		setHasClearedSplash,
		splashAspectRatio,
		setSplashAspectRatio,
		previewEmbedSplashUrl,
		setPreviewEmbedSplashUrl,
		hasClearedEmbedSplash,
		setHasClearedEmbedSplash,
		computeAspectRatioFromBase64,
	} = props;
	const handleAlignmentChange = useCallback(
		(alignment: GuildSplashCardAlignmentValue) => {
			form.setValue('splash_card_alignment', alignment, {shouldDirty: true});
		},
		[form],
	);
	const handlePreviewInvitePage = useCallback(() => {
		const currentName = form.getValues('name');
		const currentAlignment = form.getValues('splash_card_alignment');
		ModalCommands.push(
			modal(() => (
				<InvitePagePreviewModal
					guildId={guildId}
					previewSplashUrl={hasClearedSplash ? null : previewSplashUrl}
					previewIconUrl={hasClearedIcon ? null : previewIconUrl}
					previewName={currentName}
					previewSplashAlignment={currentAlignment}
					onAlignmentChange={handleAlignmentChange}
					data-flx="guild.guild-tabs.guild-overview-tab.branding-section.handle-preview-invite-page.invite-page-preview-modal"
				/>
			)),
		);
	}, [guildId, previewSplashUrl, hasClearedSplash, previewIconUrl, hasClearedIcon, form, handleAlignmentChange]);
	const handlePreviewInviteModal = useCallback(() => {
		const currentName = form.getValues('name');
		const guildRecord = Guilds.getGuild(guildId);
		if (!guildRecord) return;
		const previewIcon = hasClearedIcon ? null : previewIconUrl;
		const previewSplash = hasClearedSplash ? null : previewSplashUrl;
		ModalCommands.push(
			modal(() => (
				<InviteAcceptModalPreview
					guild={guildRecord}
					previewName={currentName}
					previewIconUrl={previewIcon}
					hasClearedIcon={hasClearedIcon}
					previewSplashUrl={previewSplash}
					hasClearedSplash={hasClearedSplash}
					data-flx="guild.guild-tabs.guild-overview-tab.branding-section.handle-preview-invite-modal.invite-accept-modal-preview"
				/>
			)),
		);
	}, [guildId, hasClearedIcon, previewIconUrl, hasClearedSplash, previewSplashUrl, form]);
	return (
		<SettingsSection
			title={<Trans>Branding</Trans>}
			data-flx="guild.guild-tabs.guild-overview-tab.branding-section.settings-section"
		>
			<div
				className={styles.brandingContent}
				data-flx="guild.guild-tabs.guild-overview-tab.branding-section.branding-content"
			>
				<GuildIconUploadField
					guild={guild}
					form={form}
					canManageGuild={canManageGuild}
					previewIconUrl={previewIconUrl}
					setPreviewIconUrl={setPreviewIconUrl}
					hasClearedIcon={hasClearedIcon}
					setHasClearedIcon={setHasClearedIcon}
					data-flx="guild.guild-tabs.guild-overview-tab.branding-section.guild-icon-upload-field"
				/>
				<Input
					data-flx="guild.guild-tabs.guild-overview-tab.branding-section.input.text"
					{...form.register('name')}
					type="text"
					label={i18n._(NAME_DESCRIPTOR)}
					placeholder={i18n._(MY_AWESOME_COMMUNITY_DESCRIPTOR)}
					minLength={1}
					maxLength={100}
					error={form.formState.errors.name?.message}
					disabled={!canManageGuild}
				/>
				{guild.features.has(GuildFeatures.BANNER) ? (
					<Controller
						name="detached_banner"
						control={form.control}
						render={({field}) => (
							<Switch
								label={i18n._(DETACHED_BANNER_DESCRIPTOR)}
								description={i18n._(WHEN_ENABLED_THE_BANNER_APPEARS_IN_ITS_OWN_DESCRIPTOR)}
								value={field.value ?? false}
								onChange={field.onChange}
								disabled={!canManageGuild}
								data-flx="guild.guild-tabs.guild-overview-tab.branding-section.switch.change"
							/>
						)}
						data-flx="guild.guild-tabs.guild-overview-tab.branding-section.controller"
					/>
				) : null}
				{guild.features.has(GuildFeatures.BANNER) ? (
					<GuildBannerUploadField
						guild={guild}
						form={form}
						canManageGuild={canManageGuild}
						previewBannerUrl={previewBannerUrl}
						setPreviewBannerUrl={setPreviewBannerUrl}
						hasClearedBanner={hasClearedBanner}
						setHasClearedBanner={setHasClearedBanner}
						bannerAspectRatio={bannerAspectRatio}
						setBannerAspectRatio={setBannerAspectRatio}
						computeAspectRatioFromBase64={computeAspectRatioFromBase64}
						data-flx="guild.guild-tabs.guild-overview-tab.branding-section.guild-banner-upload-field"
					/>
				) : null}
				{guild.features.has(GuildFeatures.INVITE_SPLASH) ? (
					<GuildInviteSplashUploadField
						guild={guild}
						form={form}
						canManageGuild={canManageGuild}
						previewSplashUrl={previewSplashUrl}
						setPreviewSplashUrl={setPreviewSplashUrl}
						hasClearedSplash={hasClearedSplash}
						setHasClearedSplash={setHasClearedSplash}
						splashAspectRatio={splashAspectRatio}
						setSplashAspectRatio={setSplashAspectRatio}
						computeAspectRatioFromBase64={computeAspectRatioFromBase64}
						data-flx="guild.guild-tabs.guild-overview-tab.branding-section.guild-invite-splash-upload-field"
					/>
				) : null}
				{guild.features.has(GuildFeatures.INVITE_SPLASH) ? (
					<GuildInviteSplashSettingsField
						form={form}
						canManageGuild={canManageGuild}
						onPreviewInvitePage={handlePreviewInvitePage}
						onPreviewInviteModal={handlePreviewInviteModal}
						data-flx="guild.guild-tabs.guild-overview-tab.branding-section.guild-invite-splash-settings-field"
					/>
				) : null}
				{guild.features.has(GuildFeatures.INVITE_SPLASH) ? (
					<GuildEmbedSplashUploadField
						guildId={guildId}
						guild={guild}
						form={form}
						canManageGuild={canManageGuild}
						previewEmbedSplashUrl={previewEmbedSplashUrl}
						setPreviewEmbedSplashUrl={setPreviewEmbedSplashUrl}
						hasClearedEmbedSplash={hasClearedEmbedSplash}
						setHasClearedEmbedSplash={setHasClearedEmbedSplash}
						data-flx="guild.guild-tabs.guild-overview-tab.branding-section.guild-embed-splash-upload-field"
					/>
				) : null}
			</div>
		</SettingsSection>
	);
};

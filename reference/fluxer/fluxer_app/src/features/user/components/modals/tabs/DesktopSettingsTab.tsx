// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {SettingsTabContainer} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {PRODUCT_NAME} from '@app/features/app/config/I18nDisplayConstants';
import Updater from '@app/features/app/state/Updater';
import {Button} from '@app/features/ui/button/Button';
import {getTelemetryEnabled, setTelemetryEnabled} from '@app/features/platform/utils/Telemetry';
import {
	getAutostartStatus,
	getCachedAutostartStatus,
	setAutostartEnabled,
} from '@app/features/platform/utils/Autostart';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {
	getCachedDesktopWindowBehaviorSettings,
	getDesktopWindowBehaviorPendingRestart,
	getDesktopWindowBehaviorSettings,
	relaunchDesktopApp,
	setDesktopWindowBehaviorSettings,
} from '@app/features/ui/utils/DesktopWindowBehaviorUtils';
import {guessPlatform, isDesktop, isNativeLinux, isNativeMacOS} from '@app/features/ui/utils/NativeUtils';
import {openUiEditor} from '@app/features/ui_editor/UiEditorController';
import type {DesktopWindowBehaviorSettings} from '@app/types/electron.d';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useLayoutEffect, useState} from 'react';

const LAUNCH_PRODUCT_AT_LOGIN_DESCRIPTOR = msg({
	message: 'Launch {productName} at login',
	comment: 'Desktop setting label for starting the app automatically after OS sign-in.',
});
const RESTART_PRODUCT_FOR_TRAY_CHANGE_DESCRIPTOR = msg({
	message:
		"Restart {productName} for this change to take effect because Linux desktops can't reliably add or remove tray icons at runtime.",
	comment: 'Desktop setting description shown when a tray-icon change on Linux requires restart.',
});
const RESTART_NOW_DESCRIPTOR = msg({
	message: 'Restart now',
	comment: 'Short label in the desktop settings tab. Keep it concise.',
});
const RESTART_DESCRIPTOR = msg({
	message: 'Restart {productName}?',
	comment: 'Confirmation prompt in the desktop settings tab. Preserve {productName}; it is inserted by code.',
});
const LATER_DESCRIPTOR = msg({
	message: 'Later',
	comment: 'Short label in the desktop settings tab. Keep it concise.',
});
const DesktopSettingsTab: React.FC = observer(() => {
	const {i18n} = useLingui();
	const cachedAutostart = getCachedAutostartStatus();
	const cachedWindowBehavior = getCachedDesktopWindowBehaviorSettings();
	const [autostartEnabled, setAutostartEnabledState] = useState(cachedAutostart ?? false);
	const [autostartBusy, setAutostartBusy] = useState(cachedAutostart === null);
	const [desktopWindowBehavior, setDesktopWindowBehaviorState] = useState<DesktopWindowBehaviorSettings | null>(
		cachedWindowBehavior,
	);
	const [desktopWindowBehaviorBusy, setDesktopWindowBehaviorBusy] = useState(cachedWindowBehavior === null);
	const [trayChangePendingRestart, setTrayChangePendingRestart] = useState(false);
	const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
	const [telemetryEnabled, setTelemetryEnabledState] = useState<boolean | null>(null);
	useLayoutEffect(() => {
		let active = true;
		void getTelemetryEnabled().then((v) => {
			if (active) setTelemetryEnabledState(v);
		});
		return () => {
			active = false;
		};
	}, []);
	const handleTelemetryChange = async (value: boolean) => {
		setTelemetryEnabledState(value);
		await setTelemetryEnabled(value);
	};
	const handleCheckForUpdates = async () => {
		setUpdateCheckBusy(true);
		try {
			// force + userInitiated: bypasses the background-check throttle and
			// surfaces the result (update modal or "you're up to date") instead
			// of updating state silently.
			await Updater.checkForUpdates(true, true);
		} finally {
			setUpdateCheckBusy(false);
		}
	};
	const platform = guessPlatform();
	const isMac = isNativeMacOS(platform);
	const isLinux = isNativeLinux(platform);
	useLayoutEffect(() => {
		let mounted = true;
		const initDesktopSettings = async () => {
			if (!isDesktop()) {
				if (mounted) {
					setAutostartBusy(false);
					setDesktopWindowBehaviorBusy(false);
				}
				return;
			}
			const needsAutostart = getCachedAutostartStatus() === null;
			const needsWindowBehavior = getCachedDesktopWindowBehaviorSettings() === null;
			if (!needsAutostart && !needsWindowBehavior) return;
			const [enabled, windowBehavior] = await Promise.all([
				needsAutostart ? getAutostartStatus() : Promise.resolve(getCachedAutostartStatus()),
				needsWindowBehavior
					? getDesktopWindowBehaviorSettings()
					: Promise.resolve(getCachedDesktopWindowBehaviorSettings()),
			]);
			if (!mounted) return;
			if (enabled !== null) {
				setAutostartEnabledState(enabled);
			}
			if (windowBehavior !== null) {
				setDesktopWindowBehaviorState(windowBehavior);
			}
			setAutostartBusy(false);
			setDesktopWindowBehaviorBusy(false);
		};
		void initDesktopSettings();
		void getDesktopWindowBehaviorPendingRestart().then((pending) => {
			if (mounted) setTrayChangePendingRestart(pending);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const handleAutostartChange = async (value: boolean) => {
		setAutostartBusy(true);
		const nextState = await setAutostartEnabled(value);
		if (nextState !== null) {
			setAutostartEnabledState(nextState);
		}
		setAutostartBusy(false);
	};
	const handleDesktopWindowBehaviorChange = async (settings: Partial<DesktopWindowBehaviorSettings>) => {
		setDesktopWindowBehaviorBusy(true);
		const nextSettings = await setDesktopWindowBehaviorSettings(settings);
		if (nextSettings !== null) {
			setDesktopWindowBehaviorState(nextSettings);
		}
		const pending = await getDesktopWindowBehaviorPendingRestart();
		setTrayChangePendingRestart(pending);
		setDesktopWindowBehaviorBusy(false);
		return {pending};
	};
	const handleShowTrayIconChange = (value: boolean) => {
		void handleDesktopWindowBehaviorChange({showTrayIcon: value}).then(({pending}) => {
			if (!pending || !isNativeLinux()) return;
			ModalCommands.push(
				modal(() => (
					<ConfirmModal
						title={i18n._(RESTART_DESCRIPTOR, {productName: PRODUCT_NAME})}
						description={
							<Trans>
								Tray icon changes only apply after a restart on Linux because the system tray protocol doesn't reliably
								let apps add or remove icons at runtime. Restart now to apply your change.
							</Trans>
						}
						primaryText={i18n._(RESTART_NOW_DESCRIPTOR)}
						primaryVariant="primary"
						secondaryText={i18n._(LATER_DESCRIPTOR)}
						onPrimary={async () => {
							await relaunchDesktopApp();
						}}
						data-flx="user.desktop-settings-tab.handle-show-tray-icon-change.confirm-modal"
					/>
				)),
			);
		});
	};
	return (
		<SettingsTabContainer data-flx="user.desktop-settings-tab.settings-tab-container">
			<SettingsSection
				id="desktop-window"
				title={<Trans>Desktop window</Trans>}
				data-flx="user.desktop-settings-tab.settings-tab-section"
			>
				{isDesktop() && (
					<Switch
						label={i18n._(LAUNCH_PRODUCT_AT_LOGIN_DESCRIPTOR, {productName: PRODUCT_NAME})}
						value={autostartEnabled}
						disabled={autostartBusy}
						onChange={handleAutostartChange}
						data-flx="user.desktop-settings-tab.switch.autostart-change"
					/>
				)}
				{isDesktop() && desktopWindowBehavior && (
					<>
						<Switch
							label={<Trans>Remember window size and position</Trans>}
							value={desktopWindowBehavior.rememberWindowState}
							disabled={desktopWindowBehaviorBusy}
							onChange={(value) => handleDesktopWindowBehaviorChange({rememberWindowState: value})}
							data-flx="user.desktop-settings-tab.switch.desktop-window-behavior-change"
						/>
						<Switch
							label={isMac ? <Trans>Show menu bar icon</Trans> : <Trans>Show system tray icon</Trans>}
							description={
								trayChangePendingRestart && isLinux
									? i18n._(RESTART_PRODUCT_FOR_TRAY_CHANGE_DESCRIPTOR, {productName: PRODUCT_NAME})
									: undefined
							}
							value={desktopWindowBehavior.showTrayIcon}
							disabled={desktopWindowBehaviorBusy}
							onChange={handleShowTrayIconChange}
							data-flx="user.desktop-settings-tab.switch.show-tray-icon-change"
						/>
						<Switch
							label={isMac ? <Trans>Minimize to menu bar</Trans> : <Trans>Minimize to tray</Trans>}
							value={desktopWindowBehavior.minimizeToTray}
							disabled={desktopWindowBehaviorBusy || !desktopWindowBehavior.showTrayIcon}
							onChange={(value) => handleDesktopWindowBehaviorChange({minimizeToTray: value})}
							data-flx="user.desktop-settings-tab.switch.desktop-window-behavior-change--2"
						/>
						<Switch
							label={isMac ? <Trans>Close to menu bar</Trans> : <Trans>Close to tray</Trans>}
							value={desktopWindowBehavior.closeToTray}
							disabled={desktopWindowBehaviorBusy || !desktopWindowBehavior.showTrayIcon}
							onChange={(value) => handleDesktopWindowBehaviorChange({closeToTray: value})}
							data-flx="user.desktop-settings-tab.switch.desktop-window-behavior-change--3"
						/>
					</>
				)}
			</SettingsSection>
			{isDesktop() && (
				<SettingsSection
					id="desktop-updates"
					title={<Trans>Updates</Trans>}
					data-flx="user.desktop-settings-tab.settings-tab-section--updates"
				>
					<div data-flx="user.desktop-settings-tab.updates-row">
						<p data-flx="user.desktop-settings-tab.updates-version">
							{/* "Current version" MUST be the INSTALLED version
							    (Updater.currentVersion), never displayVersion —
							    displayVersion is the AVAILABLE/target version of a
							    pending update, so showing it here mislabeled the
							    update-target as if it were already installed (e.g.
							    "Current version: 0.1.7" right after a check while
							    still on an older build). If an update is available,
							    it's surfaced separately below. */}
							{Updater.currentVersion ? (
								<Trans>Current version: {Updater.currentVersion}</Trans>
							) : (
								<Trans>Version unknown</Trans>
							)}
							{Updater.displayVersion && Updater.displayVersion !== Updater.currentVersion ? (
								<>
									{' — '}
									<Trans>update available: {Updater.displayVersion}</Trans>
								</>
							) : null}
						</p>
						<Button
							small={true}
							submitting={updateCheckBusy}
							onClick={handleCheckForUpdates}
							data-flx="user.desktop-settings-tab.button.check-for-updates"
						>
							<Trans>Check for updates</Trans>
						</Button>
					</div>
				</SettingsSection>
			)}
			{isDesktop() && (
				<SettingsSection
					id="desktop-privacy"
					title={<Trans>Privacy</Trans>}
					data-flx="user.desktop-settings-tab.settings-tab-section--privacy"
				>
					<Switch
						label={<Trans>Send anonymous error reports</Trans>}
						description={
							<Trans>
								Shares console errors (message, stack trace, app version) to help fix bugs. No messages, account
								data, or personal information is ever sent.
							</Trans>
						}
						value={telemetryEnabled ?? false}
						onChange={handleTelemetryChange}
						data-flx="user.desktop-settings-tab.switch.telemetry"
					/>
				</SettingsSection>
			)}
			{isDesktop() && (
				<SettingsSection
					id="desktop-appearance"
					// Plain strings (not <Trans>): these UI-editor strings aren't in
					// the translation catalog, and <Trans>/msg() on an uncompiled
					// message spams "Uncompiled message detected" warnings. Kept as
					// literals until/unless they're added to the catalog.
					title="Appearance"
					data-flx="user.desktop-settings-tab.settings-tab-section--appearance"
				>
					<div className="settings-row-block">
						<p>
							Customize the look and layout of {PRODUCT_NAME}. Recolor the interface, rearrange and resize the
							main panels, or write your own layout in LuaU.
						</p>
						<Button
							small={true}
							onClick={() => {
								// Close the settings modal so the editor's live preview
								// isn't hidden behind it, then open the editor.
								ModalCommands.popAll();
								openUiEditor();
							}}
							data-flx="user.desktop-settings-tab.button.open-ui-editor"
						>
							Open UI editor
						</Button>
					</div>
				</SettingsSection>
			)}
		</SettingsTabContainer>
	);
});

export default DesktopSettingsTab;

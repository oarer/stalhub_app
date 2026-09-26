use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginApi, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "dev.stalhub.installer";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallArgs {
    path: String,
}

pub struct Installer<R: Runtime> {
    #[cfg(not(mobile))]
    _marker: std::marker::PhantomData<fn() -> R>,
    #[cfg(mobile)]
    handle: Option<PluginHandle<R>>,
}

impl<R: Runtime> Installer<R> {
    pub fn install_apk(&self, path: String) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            let handle = self
                .handle
                .as_ref()
                .ok_or_else(|| "apk installer unavailable".to_string())?;
            handle
                .run_mobile_plugin::<()>("installApk", InstallArgs { path })
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = path;
            Err("apk install is android-only".to_string())
        }
    }
}

pub trait InstallerExt<R: Runtime> {
    fn installer(&self) -> &Installer<R>;
}

impl<R: Runtime, T: Manager<R>> InstallerExt<R> for T {
    fn installer(&self) -> &Installer<R> {
        self.state::<Installer<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("installer")
        .setup(|app, api: PluginApi<R, ()>| {
            // Кривой install-плагин не должен ронять старт приложения:
            // без handle команда честно отвечает "unavailable".
            #[cfg(target_os = "android")]
            let handle = match api
                .register_android_plugin(PLUGIN_IDENTIFIER, "InstallPlugin")
            {
                Ok(handle) => Some(handle),
                Err(error) => {
                    log::warn!("apk installer registration failed: {error}");
                    None
                }
            };
            app.manage(Installer {
                #[cfg(not(mobile))]
                _marker: std::marker::PhantomData::<fn() -> R>,
                #[cfg(mobile)]
                handle,
            });
            Ok(())
        })
        .build()
}

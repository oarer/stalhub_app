mod api_bridge;
mod capture;
mod deeplink;
mod overlay;
mod update_android;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(deeplink::PendingLinks::default())
        .invoke_handler(tauri::generate_handler![
            api_bridge::api_proxy,
            capture::capture_list_windows,
            capture::capture_find_game,
            capture::capture_frame,
            deeplink::renderer_ready,
            deeplink::renderer_not_ready,
            overlay::trading_overlay_open,
            overlay::trading_overlay_close,
            update_android::android_check_update,
            update_android::android_download_update,
            update_android::android_install_update
        ])
        .plugin(tauri_plugin_log::Builder::default().build());
    // single-instance — только desktop: плагин не поддерживает mobile,
    // да и второй копии приложения на mobile быть не может.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        // Second-instance argv (аналог app.on('second-instance')):
        // ссылки вида stalhub:* уходят в тот же accept-путь.
        let urls: Vec<url::Url> = argv
            .iter()
            .filter_map(|arg| url::Url::parse(arg).ok())
            .collect();
        if !urls.is_empty() {
            deeplink::handle_open(app, urls);
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            #[cfg(desktop)]
            {
                let _ = app.deep_link().register_all();
            }
            // Рантайм-ссылки (включая second-instance через single-instance),
            // аналог process.argv.forEach(acceptDeeplink) из Electron.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                deeplink::handle_open(&handle, event.urls());
            });
            // Стартовые ссылки: emission плагина происходит раньше setup,
            // поэтому забираем их напрямую (аналог process.argv при старте).
            if let Ok(Some(startup)) = app.deep_link().get_current() {
                deeplink::handle_open(app.handle(), startup);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

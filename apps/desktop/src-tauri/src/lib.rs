mod wake_word;

use std::sync::{Arc, Mutex};
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandEvent;
struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

struct WakeWordState(Arc<wake_word::WakeWordDetector>);

fn toggle_hud_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("hud") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn toggle_hud(app: tauri::AppHandle) {
    toggle_hud_window(&app);
}

#[tauri::command]
fn update_tray_status(app: tauri::AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id("main_tray") {
        let _ = tray.set_tooltip(Some(tooltip));
        let _ = tray.set_title(Some(title));
    }
}

#[tauri::command]
fn start_wake_word(app: tauri::AppHandle, state: tauri::State<WakeWordState>) -> Result<(), String> {
    state.0.start(app)
}

#[tauri::command]
fn stop_wake_word(state: tauri::State<WakeWordState>) {
    state.0.stop();
}

#[tauri::command]
fn is_wake_word_running(state: tauri::State<WakeWordState>) -> bool {
    state.0.is_running()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state = SidecarState(Arc::new(Mutex::new(None)));
    let sidecar_state_clone = sidecar_state.0.clone();
    let wake_detector = WakeWordState(Arc::new(wake_word::WakeWordDetector::new()));

    tauri::Builder::default()
        .manage(sidecar_state)
        .manage(wake_detector)
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_hud_window(app);
                    }
                })
                .build()
        )
        .on_window_event(move |window, event| {
            if window.label() == "hud" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(child) = sidecar_state_clone.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Register global shortcut
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let Ok(shortcut) = "Ctrl+Alt+Space".parse::<tauri_plugin_global_shortcut::Shortcut>() {
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    log::warn!("Could not register Ctrl+Alt+Space shortcut: {:?}", e);
                }
            }

            // Configure System Tray
            let open_item = tauri::menu::MenuItem::with_id(app, "open", "Open LifeOS", true, None::<&str>)?;
            let aven_item = tauri::menu::MenuItem::with_id(app, "aven", "Aven HUD", true, None::<&str>)?;
            let quit_item = tauri::menu::MenuItem::with_id(app, "quit", "Quit LifeOS", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&open_item, &aven_item, &quit_item])?;

            let _tray = tauri::tray::TrayIconBuilder::with_id("main_tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("LifeOS: Calm")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "aven" => {
                            toggle_hud_window(app);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            #[cfg(debug_assertions)]
            {
                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    if let Some(window) = app_handle.get_webview_window("main") {
                        log::info!("Connecting Tauri dev window to active Next.js dev server on http://localhost:3000/login");
                        let _ = window.navigate("http://localhost:3000/login".parse().unwrap());
                    }
                    if let Some(hud) = app_handle.get_webview_window("hud") {
                        let _ = hud.navigate("http://localhost:3000/hud".parse().unwrap());
                    }
                });
            }

            #[cfg(not(debug_assertions))]
            tauri::async_runtime::spawn(async move {
                let shell = app_handle.shell();
                let resource_dir_base = app_handle.path().resource_dir().unwrap();
                let resource_dir = resource_dir_base.join("web");
                
                log::info!("Resource Dir Base: {:?}", resource_dir_base);
                log::info!("Sidecar CWD: {:?}", resource_dir);
                
                // If it doesn't exist in dev, we fallback to src-tauri/resources/web directly
                let target_dir = if resource_dir.exists() {
                    resource_dir
                } else {
                    std::env::current_dir().unwrap().join("resources").join("web")
                };
                
                log::info!("Final Sidecar CWD: {:?}", target_dir);

                let command = shell.sidecar("node").unwrap()
                    .current_dir(&target_dir)
                    .args(["start.cjs"])
                    .env("PORT", "3456");
                
                let (mut rx, child) = command.spawn().expect("Failed to spawn node sidecar");
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    *state.0.lock().unwrap() = Some(child);
                }

                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line = String::from_utf8_lossy(&line);
                            log::info!("Sidecar: {}", line.trim());
                            
                            if line.contains("[LIFEOS_BOOT:") {
                                let msg = line.split("[LIFEOS_BOOT:").nth(1).unwrap_or("").split("]").next().unwrap_or("").trim();
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.eval(&format!("window.setStatus('{}', false)", msg.replace("'", "\\'")));
                                }
                            }
                            else if line.contains("[LIFEOS_ERROR:") {
                                let msg = line.split("[LIFEOS_ERROR:").nth(1).unwrap_or("").split("]").next().unwrap_or("").trim();
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.eval(&format!("window.setStatus('{}', true)", msg.replace("'", "\\'")));
                                }
                            }
                            else if line.contains("[LIFEOS_READY]") {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.navigate("http://localhost:3456/login".parse().unwrap());
                                }
                                if let Some(hud) = app_handle.get_webview_window("hud") {
                                    let _ = hud.navigate("http://localhost:3456/hud".parse().unwrap());
                                }
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let line = String::from_utf8_lossy(&line);
                            log::error!("Sidecar Err: {}", line);
                        }
                        CommandEvent::Error(err) => {
                            log::error!("Sidecar Process Error: {}", err);
                        }
                        CommandEvent::Terminated(payload) => {
                            log::info!("Sidecar Terminated: {:?}", payload);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_hud,
            update_tray_status,
            start_wake_word,
            stop_wake_word,
            is_wake_word_running
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

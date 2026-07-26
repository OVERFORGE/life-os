use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state = SidecarState(Arc::new(Mutex::new(None)));
    let sidecar_state_clone = sidecar_state.0.clone();

    tauri::Builder::default()
        .manage(sidecar_state)
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
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(mut child) = sidecar_state_clone.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            
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
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

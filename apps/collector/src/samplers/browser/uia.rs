//! UI Automation address-bar reader (Windows only).

use super::detect::BrowserKind;

#[cfg(windows)]
pub fn read_address_bar_url(hwnd: isize, kind: BrowserKind) -> Option<String> {
    mod imp {
        use super::super::detect::BrowserKind;
        use std::sync::Once;
        use windows::core::Interface;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
        };
        use windows::Win32::UI::Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
            TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_EditControlTypeId,
            UIA_ValuePatternId,
        };

        static COM_INIT: Once = Once::new();

        pub fn read(hwnd: isize, kind: BrowserKind) -> Option<String> {
            let hwnd = HWND(hwnd as *mut _);
            if hwnd.0.is_null() {
                return None;
            }
            let automation = automation()?;
            unsafe {
                let root = automation.ElementFromHandle(hwnd).ok()?;
                scan_edits(&root, kind)
            }
        }

        fn automation() -> Option<IUIAutomation> {
            COM_INIT.call_once(|| unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            });
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok() }
        }

        unsafe fn scan_edits(root: &IUIAutomationElement, kind: BrowserKind) -> Option<String> {
            let automation = automation()?;
            let condition = automation
                .CreatePropertyCondition(
                    UIA_ControlTypePropertyId,
                    &windows::core::VARIANT::from(UIA_EditControlTypeId.0 as i32),
                )
                .ok()?;
            let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
            let len = elements.Length().ok()? as usize;
            for i in 0..len {
                let el = elements.GetElement(i as i32).ok()?;
                let name = el.CurrentName().ok().map(|b| b.to_string()).unwrap_or_default();
                if !is_address_bar_name(&name, kind) {
                    continue;
                }
                if let Some(url) = read_value_pattern(&el) {
                    if looks_like_url(&url) {
                        return Some(normalize_url(&url));
                    }
                }
            }
            None
        }

        unsafe fn read_value_pattern(el: &IUIAutomationElement) -> Option<String> {
            let pattern = el.GetCurrentPattern(UIA_ValuePatternId).ok()?;
            let value = pattern.cast::<IUIAutomationValuePattern>().ok()?;
            let bstr = value.CurrentValue().ok()?;
            let s = bstr.to_string();
            if s.is_empty() { None } else { Some(s) }
        }

        fn is_address_bar_name(name: &str, kind: BrowserKind) -> bool {
            let n = name.to_ascii_lowercase();
            if kind.is_firefox() {
                return n.contains("search with")
                    || n.contains("enter address")
                    || n.contains("address bar")
                    || n.contains("search or enter");
            }
            n.contains("address and search")
                || n.contains("address bar")
                || n.contains("search or enter")
                || n.contains("search or type")
                || n.contains("omnibox")
        }

        fn looks_like_url(s: &str) -> bool {
            let t = s.trim();
            !t.is_empty()
                && (t.starts_with("http://")
                    || t.starts_with("https://")
                    || t.starts_with("file://")
                    || t.starts_with("chrome://")
                    || t.starts_with("edge://")
                    || t.starts_with("about:")
                    || t.contains("://")
                    || (t.contains('.') && !t.contains(' ')))
        }

        fn normalize_url(url: &str) -> String {
            let t = url.trim();
            if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("file://") {
                return t.to_string();
            }
            if t.contains("://") {
                return t.to_string();
            }
            format!("https://{t}")
        }
    }

    imp::read(hwnd, kind)
}

#[cfg(not(windows))]
pub fn read_address_bar_url(_hwnd: isize, _kind: BrowserKind) -> Option<String> {
    None
}

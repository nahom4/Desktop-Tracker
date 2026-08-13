/**
 * Desktop Tracker — window provider.
 *
 * GNOME Shell on Wayland gives no way for an outside process to ask "which
 * window has focus?": there is no _NET_ACTIVE_WINDOW, and org.gnome.Shell.Eval
 * is disabled outside developer mode. Only shell-side code can see the display,
 * so this extension exposes exactly one read-only method on the session bus and
 * the Rust collector polls it once per second.
 *
 * It reports wm_class, title, pid and the window frame type. Nothing else, and
 * nothing is ever written back to the display.
 */

import Gio from "gi://Gio";
import Meta from "gi://Meta";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const BUS_NAME = "org.gnome.Shell.Extensions.DesktopTracker";
const OBJECT_PATH = "/org/gnome/Shell/Extensions/DesktopTracker";

const IFACE = `
<node>
  <interface name="org.gnome.Shell.Extensions.DesktopTracker">
    <method name="GetFocusedWindow">
      <arg type="s" direction="out" name="json"/>
    </method>
    <property name="ApiVersion" type="u" access="read"/>
  </interface>
</node>`;

/** Window types that represent something a person is actually looking at. */
const REAL_WINDOW_TYPES = new Set([
  Meta.WindowType.NORMAL,
  Meta.WindowType.DIALOG,
  Meta.WindowType.MODAL_DIALOG,
  Meta.WindowType.UTILITY,
]);

class WindowProvider {
  get ApiVersion() {
    return 1;
  }

  GetFocusedWindow() {
    return JSON.stringify(this._snapshot());
  }

  _snapshot() {
    const empty = {
      focused: false,
      wm_class: null,
      title: null,
      pid: 0,
      sandboxed_app_id: null,
    };

    let win = null;
    try {
      win = global.display.get_focus_window();
    } catch (_e) {
      return empty;
    }
    if (!win) return empty;

    // Tooltips, docks and the shell's own overlays are not "activity".
    try {
      if (!REAL_WINDOW_TYPES.has(win.get_window_type())) return empty;
    } catch (_e) {
      /* older shells may not expose the type; fall through and report it */
    }

    return {
      focused: true,
      wm_class: safe(() => win.get_wm_class()),
      title: safe(() => win.get_title()),
      // -1 when the client did not advertise a pid (some XWayland clients).
      pid: safe(() => win.get_pid()) ?? 0,
      // Set for Flatpak/Snap apps, where the pid lives in another namespace.
      sandboxed_app_id: safe(() => win.get_sandboxed_app_id?.()),
    };
  }
}

function safe(fn) {
  try {
    const v = fn();
    return v === undefined ? null : v;
  } catch (_e) {
    return null;
  }
}

export default class DesktopTrackerExtension extends Extension {
  enable() {
    this._provider = new WindowProvider();
    this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this._provider);
    this._dbus.export(Gio.DBus.session, OBJECT_PATH);
    this._ownerId = Gio.bus_own_name(
      Gio.BusType.SESSION,
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      null,
      null,
      null
    );
  }

  disable() {
    if (this._ownerId) {
      Gio.bus_unown_name(this._ownerId);
      this._ownerId = null;
    }
    if (this._dbus) {
      this._dbus.unexport();
      this._dbus = null;
    }
    this._provider = null;
  }
}

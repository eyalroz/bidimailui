var Services = globalThis.Services;
var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

// Note: There are some duplicates with injections from messenger.js, as those are not (easily) accessible
// from within this window. Specifically: The accel key for cycling message direction forcing mode,
// and the two scripts

const debugInjection = false;

Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-display-logic.js", window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-messenger.js", window, "UTF-8");

function injectOtherElements() {
  WL.injectElements(`
    <keyset id="mailKeys">
      <key id="key-bidimailui-cycle"
           modifiers="&key-bidimail-cycle-direction-setting-mode.modifiers;"
           key="&key-bidimail-cycle-direction-setting-mode.keycode;"
           oncommand="BiDiMailUI.MessageOverlay.cycleDirectionSettings()" />
    </keyset>

    <menupopup id="mailContext">
      <menuseparator insertafter="mailContext-sep-clipboard"/>
      <menuitem id="context-bidiui-cycle-direction-setting-mode"
                label="&menu-bidimail-cycle-direction-setting-mode.label;"
                key="key-bidimailui-cycle"
                accesskey="&menu-bidimail-cycle-direction-setting-mode.accesskey;"
                oncommand="BiDiMailUI.MessageOverlay.cycleDirectionSettings()" />
    </menupopup>`,
  [
    "chrome://bidimailui/locale/bidimailui.dtd"
  ],
  debugInjection);
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();
}

// called on window unload or on add-on deactivation while window is still open
function onUnload(deactivatedWhileWindowOpen) {
}

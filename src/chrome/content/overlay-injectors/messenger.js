var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

const debugInjection = false;

Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-display-logic.js", window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-messenger.js", window, "UTF-8");

function injectToolbarButton() {
  WL.injectElements(`
  <toolbarpalette id="MailToolbarPalette">
    <toolbarbutton id="bidimailui-forcing-menubutton"
                   oncommand="BiDiMailUI.MessageOverlay.cycleDirectionSettings();"
                   label="&bidimailui-forcing-menubutton.label;"
                   tooltiptext="&bidimailui-forcing-menubutton.tip;"
                   type="menu-button"
                   is="toolbarbutton-menu-button"
                   selectedItem="autodetect"
                   insert-after="button-goforward"
                   removable="true"
                   class="toolbarbutton-1 chromeclass-toolbar-additional custombutton">
      <menupopup onpopupshowing="">
        <label value="&bidimailui-forcing-menu.label;" style="font-weight: bold"/>
        <menuseparator />
        <menuitem
          type="radio"
          id="bidimailui-forcing-menu-autodetect"
          label="&bidimailui-forcing-menu-autodetect.label;"
          oncommand="BiDiMailUI.MessageOverlay.forceDirection(event,null);" />
        <menuitem
          type="radio"
          id="bidimailui-forcing-menu-ltr"
          label="&bidimailui-forcing-menu-ltr.label;"
          oncommand="BiDiMailUI.MessageOverlay.forceDirection(event,'ltr');" />
        <menuitem
          type="radio"
          id="bidimailui-forcing-menu-rtl"
          label="&bidimailui-forcing-menu-rtl.label;"
          oncommand="BiDiMailUI.MessageOverlay.forceDirection(event,'rtl');" />
      </menupopup>
    </toolbarbutton>
  </toolbarpalette>`,
  [
    "chrome://bidimailui/locale/bidimailui.dtd"
  ],
  debugInjection);
}

function onLoadForWin() {
  console.log(`window is ${window}`);
  BiDiMailUI.MessageOverlay.onLoad(window);
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectToolbarButton();
  // We currently use a single CSS file for all of our style (not including the
  // dynamically-injected quotebar CSS for message documents)
  WL.injectCSS("chrome://bidimailui/content/skin/classic/bidimailui.css");

  // TODO: Is the capture parameter even respected?
  let doCapture = true;
  window.addEventListener("MsgLoaded", onLoadForWin, doCapture);
  //
  // Since we no longer have per-platform-skin support, we set this attribute
  // on our root element, so that, in our stylesheet, we can contextualize using
  // this attribute, e.g.
  //
  // [platform="Darwin"] someElement {
  //     background-color: red;
  // }
  //
  document.documentElement.setAttribute("platform", Services.appinfo.os);
}

// called on window unload or on add-on deactivation while window is still open
function onUnload(deactivatedWhileWindowOpen) {
  // no need to clean up UI on global shutdown
  if (!deactivatedWhileWindowOpen) return;
  // If we've added any elements not through WL.inject functions - we need to remove
  // them manually here. The WL-injected elements get auto-removed
  window.removeEventListener("MsgLoaded", onLoadForWin);
}

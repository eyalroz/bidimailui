var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

var debugInjection = false;

// Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-display-logic.js", window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-composer.js", window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://bidimailui/content/bidimailui-editor.js", window, "UTF-8");


function injectOtherElements() {
  WL.injectElements(`
<broadcasterset id="broadcasterset">
  <broadcaster id="ltr-document-direction-broadcaster" checked="false"/>
  <broadcaster id="rtl-document-direction-broadcaster" checked="false"/>
  <broadcaster id="ltr-paragraph-direction-broadcaster" checked="false"/>
  <broadcaster id="rtl-paragraph-direction-broadcaster" checked="false"/>
</broadcasterset>

<commandset id="composerStyleMenuItems">
  <command id="cmd_rtl_document"
           oncommand="goDoCommand('cmd_rtl_document');"/>
  <command id="cmd_ltr_document"
           oncommand="goDoCommand('cmd_ltr_document');"/>
  <command id="cmd_switch_document"
           oncommand="goDoCommand('cmd_switch_document');"/>
  <command id="cmd_rtl_paragraph"
           oncommand="goDoCommand('cmd_rtl_paragraph');"
           commandupdater="true"
           events="focus"
           oncommandupdate="BiDiMailUI.Composition.commandUpdate_MsgComposeDirection()"/>
  <command id="cmd_ltr_paragraph"
           oncommand="goDoCommand('cmd_ltr_paragraph');"
           commandupdater="true"
           events="focus"
           oncommandupdate="BiDiMailUI.Composition.commandUpdate_MsgComposeDirection()"/>
  <command id="cmd_switch_paragraph"
           oncommand="goDoCommand('cmd_switch_paragraph');"
           commandupdater="true"
           events="focus"
           oncommandupdate="BiDiMailUI.Composition.commandUpdate_MsgComposeDirection()"/>
  <command id="cmd_clear_paragraph_dir"
           oncommand="goDoCommand('cmd_clear_paragraph_dir');"
           commandupdater="true"
           events="focus"
           oncommandupdate="BiDiMailUI.Composition.commandUpdate_MsgComposeDirection()"/>
</commandset>

<toolbar id="FormatToolbar">
  <hbox id="directionality-formatting-toolbar-section"
        insertafter="IncreaseFontSizeButton"
        dir="ltr">
    <toolbarbutton id="button-direction-ltr-formatting-bar"
                   command="cmd_ltr_paragraph"
                   observes="ltr-paragraph-direction-broadcaster"
                   checked="false"
                   tooltiptext="&bidimail-ltr-button.tip;"/>
    <toolbarbutton id="button-direction-rtl-formatting-bar"
                   command="cmd_rtl_paragraph"
                   observes="rtl-paragraph-direction-broadcaster"
                   checked="false"
                   tooltiptext="&bidimail-rtl-button.tip;"/>
  </hbox>
  <toolbarseparator class="toolbarseparator-standard"
                    insertafter="IncreaseFontSizeButton"
                    id="directionality-separator-formatting-bar"/>
</toolbar>

<menu id="viewMenu">
  <menupopup id="menu_View_Popup">
    <menuitem command="cmd_switch_document"
              key="key-switch-document-direction"
              label="&menu-bidimail-switch-page-direction.label;"
              accesskey="&menu-bidimail-switch-document-direction.accesskey;"/>
  </menupopup>
</menu>

<menu id="formatMenu">
  <menupopup id="formatMenuPopup">
    <menuseparator/>
    <menuitem id="formatSwitchParagraphDirectionItem"
              command="cmd_switch_paragraph"
              key="key-switch-paragraph-direction"
              label="&menu-bidimail-switch-paragraph-direction.label;"
              accesskey="&menu-bidimail-switch-paragraph-direction.accesskey;"/>
    <menuitem id="format_ClearParagraphDirectionItem"
              command="cmd_clear_paragraph_dir"
              label="&menu-bidimail-clear-paragraph-direction.label;"
              accesskey="&menu-bidimail-clear-paragraph-direction.accesskey;"/>
  </menupopup>
</menu>

<keyset id="tasksKeys">
  <key id="key-switch-document-direction"
       command="cmd_switch_document"
       modifiers="&key-bidimail-switch-document-direction.modifiers;"
       key="&key-bidimail-switch-document-direction.keycode;"/>
  <key id="key-switch-paragraph-direction"
       command="cmd_switch_paragraph"
       modifiers="&key-bidimail-switch-paragraph-direction.modifiers;"
       key="&key-bidimail-switch-paragraph-direction.keycode;"/>
</keyset>
    `,
    [
      "chrome://bidimailui/locale/bidimailui.dtd"
    ],
    debugInjection
  );
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();
  // We currently use a single CSS file for all of our style (not including the dynamically-injecte quotebar CSS for message documents)
  WL.injectCSS("chrome://bidimailui/content/skin/classic/bidimailui.css");

  window.top.controllers.appendController(BiDiMailUI.Composition.directionSwitchController);

  const capture = true;
  window.addEventListener("compose-window-init",   BiDiMailUI.Composition.onInit, capture);
  window.addEventListener("keypress",              BiDiMailUI.Composition.onKeyPress,             capture);
  if (BiDiMailUI.Prefs.getBoolPref("compose.ctrl_shift_switches_direction", true)) {
    document.addEventListener("keydown",           BiDiMailUI.Composition.onKeyDown,              capture);
    document.addEventListener("keyup",             BiDiMailUI.Composition.onKeyUp,                capture);
  }

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
  if (!deactivatedWhileWindowOpen)
    return;

  // If we've added any elements not through WL.inject functions - we need to remove
  // them manually here. The WL-injected elements get auto-removed

  const capture = true;
  window.removeEventListener("compose-window-init",   BiDiMailUI.Composition.onInit, capture);
  window.removeEventListener("keypress",              BiDiMailUI.Composition.onKeyPress,             capture);
  try {
    document.removeEventListener("keydown",           BiDiMailUI.Composition.onKeyDown,              capture);
    document.removeEventListener("keyup",             BiDiMailUI.Composition.onKeyUp,                capture);
  } catch(ex) { }
}

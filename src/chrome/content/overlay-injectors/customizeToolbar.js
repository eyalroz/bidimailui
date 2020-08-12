console.log("top level code of customizeToolbar overlay injector script!");


// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  console.log("in customizeToolbar overlay injector script - onLoad!");
  WL.injectCSS("chrome://bidimailui/content/skin/classic/bidimailui.css");
}

// called on window unload or on add-on deactivation while window is still open
function onUnload(deactivatedWhileWindowOpen) {
    // no need to clean up UI on global shutdown
    if (!deactivatedWhileWindowOpen)
        return;
}


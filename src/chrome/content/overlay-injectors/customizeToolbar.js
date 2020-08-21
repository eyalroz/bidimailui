console.log("top level code of customizeToolbar overlay injector script!");


// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  console.log("in customizeToolbar overlay injector script - onLoad!");
  WL.injectCSS("chrome://bidimailui/content/skin/classic/bidimailui.css");

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
}


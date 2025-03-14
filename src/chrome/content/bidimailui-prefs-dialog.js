var { BiDiMailUI } = ChromeUtils.importESModule("chrome://bidimailui/content/bidimailui-common.mjs");

BiDiMailUI.PrefPane = {};

BiDiMailUI.PrefPane.init = function () {
  window.addEventListener("dialoghelp", this.openGuide, true);
};

BiDiMailUI.PrefPane.openGuide = function (aEvent) {
  try {
    // Open the user guide in the default browser.
    const helpLink = document.getElementById("bidiMailUIPrefPane")
                           .getAttribute("helpURI");
    const uri = Cc["@mozilla.org/network/io-service;1"]
      .getService(Ci.nsIIOService)
      .newURI(helpLink, null, null);
    const protocolSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService);
    protocolSvc.loadUrl(uri);
  } catch (ex) {
    dump(ex);
  }

  // Prevent the default help button behavior
  aEvent.preventDefault();
  aEvent.stopPropagation();
};

BiDiMailUI.PrefPane._getPrefElement = function (prefName) {
  return document.getElementById(BiDiMailUI.Prefs._branchStr + prefName);
};

BiDiMailUI.PrefPane.getSpaceBetweenParagraphsValue = function () {
  const txtBoxValue =
    document.getElementById("space_between_paragraphs_value_text").value;
  let rv = 0;

  if (this._getPrefElement("compose.space_between_paragraphs.scale")
          .value != "px") {
    const floatVal = parseFloat(txtBoxValue);
    if (!isNaN(floatVal)) {
      rv = floatVal;
    }
  } else {
    const intVal = parseInt(txtBoxValue, 10);
    if (!isNaN(intVal)) {
      rv = intVal;
    }
  }

  return rv;
};

BiDiMailUI.PrefPane.updateSpaceBetweenParagraphsValue = function () {
  this._getPrefElement("compose.space_between_paragraphs.value").value =
    this.getSpaceBetweenParagraphsValue();
};

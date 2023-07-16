var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

BiDiMailUI.PrefPane = {
  init: function() {
    window.addEventListener("dialoghelp", this.openGuide, true);
  },

  openGuide: function(aEvent) {
    try {
      // Open the user guide in the default browser.
      var helpLink = document.getElementById("bidiMailUIPrefPane")
                             .getAttribute("helpURI");
      var uri = Cc["@mozilla.org/network/io-service;1"]
        .getService(Ci.nsIIOService)
        .newURI(helpLink, null, null);
      var protocolSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Ci.nsIExternalProtocolService);
      protocolSvc.loadUrl(uri);
    }
    catch(ex) {
      dump(ex);
    }

    // Prevent the default help button behavior
    aEvent.preventDefault();
    aEvent.stopPropagation();
  },

  _getPrefElement: function(prefName) {
    return document.getElementById(BiDiMailUI.Prefs._branchStr + prefName);
  },

  getSpaceBetweenParagraphsValue: function() {
    var txtBoxValue =
      document.getElementById("space_between_paragraphs_value_text").value;
    var rv = 0;

    if (this._getPrefElement("compose.space_between_paragraphs.scale")
            .value != "px") {
      var floatVal = parseFloat(txtBoxValue, 10);
      if (!isNaN(floatVal))
        rv = floatVal;
    }
    else {
      var intVal = parseInt(txtBoxValue, 10);
      if (!isNaN(intVal))
        rv = intVal;
    }

    return rv;
  },

  updateSpaceBetweenParagraphsValue: function() {
    this._getPrefElement("compose.space_between_paragraphs.value").value = 
      this.getSpaceBetweenParagraphsValue();
  }
};

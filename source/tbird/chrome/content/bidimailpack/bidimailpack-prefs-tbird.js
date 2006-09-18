/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the BiDi Mail UI extension
 *
 * The Initial Developer of the Original Code is Asaf Romano
 *
 * Portions created by the Initial Developer are Copyright (C) 2004-2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Asaf Romano <mozilla.mano@sent.com>
 *   Eyal Rozenberg <eyalroz@technion.ac.il>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var gBDMPrefPane = {
  init: function() {
    window.addEventListener("dialoghelp", this.openGuide, true);
  },

  openGuide: function(aEvent) {
    try {
      // Open the user guide in the default browser.
      var helpLink = document.getElementById("bidiMailUIPrefPane")
                             .getAttribute("helpURI");
      var uri = Components.classes["@mozilla.org/network/io-service;1"]
                          .getService(Components.interfaces.nsIIOService)
                          .newURI(helpLink, null, null);
      var protocolSvc =
        Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                  .getService(Components.interfaces.nsIExternalProtocolService);
      protocolSvc.loadUrl(uri);
    }
    catch(ex) {
      dump(ex);
    }

    // Prevent the default help button behavior
    aEvent.preventDefault();
    aEvent.stopPropagation();
  },

  _getBDMPrefElement: function(prefName) {
    return document.getElementById("bidiui.mail." + prefName);
  },

  getSpaceBetweenParagraphsValue: function() {
    var txtBoxValue =
      document.getElementById("space_between_paragraphs_value_text").value;
    var rv = 0;

    if (this._getBDMPrefElement("compose.space_between_paragraphs.scale")
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
    this._getBDMPrefElement("compose.space_between_paragraphs.value").value = 
      this.getSpaceBetweenParagraphsValue();
  }
};

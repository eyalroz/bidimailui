function SetMessageDirection(dir) {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  body.setAttribute('dir', dir);
  // TB only
  UpdateDirectionButtons(dir);
}

function SwitchMessageDirection() {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  var currentDir = window.getComputedStyle(body, null).direction;

  if (currentDir == 'rtl') {
    body.setAttribute('dir', 'ltr');
    UpdateDirectionButtons('ltr');
  } 
  else {
    body.setAttribute('dir', 'rtl');
    UpdateDirectionButtons('rtl');
  }
}

// TB only - update optional direction buttons status
function UpdateDirectionButtons(direction) {
  var caster = document.getElementById("ltr-document-direction-broadcaster");
  caster.setAttribute("checked", direction == "ltr");
  caster = document.getElementById("rtl-document-direction-broadcaster");
  caster.setAttribute("checked", direction == "rtl");
}

function browserOnLoadHandler() {
  // just in case, load attributes on elements after the dom tree is ready
  setTimeout('LoadOSAttributeOnWindow();', 0);
  
  var body = this.docShell.contentViewer.DOMDocument.body;
  var bodyIsPlainText = body.childNodes.length > 1
    && body.childNodes[1].className != 'moz-text-html'; // either '*-plain' or '*-flowed'

  // quote bar css
  var newSS;
  newSS = this.docShell.contentViewer.DOMDocument.createElement("link");
  newSS.rel  = "stylesheet";
  newSS.type = "text/css";
  newSS.href = "chrome://bidimailpack/content/quotebar.css";
  head = this.docShell.contentViewer.DOMDocument.getElementsByTagName("head")[0];
  if (head)
    head.appendChild(newSS);

  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

  // Auto-detect some mis-decoded messages
  try {
    var forcePref = false, charsetPref = null;
    var misdecodeAutodetectPref = true;
    try {
      forcePref = prefs.getBoolPref("mailnews.force_charset_override");
    } catch(e) {}
    try {
      charsetPref = prefs.getCharPref("mailnews.view_default_charset");
    } catch(e) {}
    try {
      misdecodeAutodetectPref = prefs.getBoolPref("mailnews.message_display.autodetect_bidi_misdecoding");
    } catch(e) {}
     
    // When shall we attempt re-detection and overriding of the character set?
    // not if the encoding has _already_ been overridden (either due to the pref or not)
    // and not if the default charset is not one of the 256-char codepages we expect get
    // mangled, and then only when the charset is reported as one of the defaultish ones
    // (or not reported at all)?
    // Note that this means we don't detect 'false positives' e.g. of
    // identifying a non-windows-1255 as windows-1255
      
    if ( misdecodeAutodetectPref && charsetPref &&
         ((charsetPref == 'windows-1255') ||
          (charsetPref == 'windows-1256')) &&
         (!msgWindow.charsetOverride) &&
         ((!msgWindow.mailCharacterSet) ||
          (msgWindow.mailCharacterSet == 'US-ASCII') ||
          (msgWindow.mailCharacterSet == 'ISO-8859-1') ||
          (msgWindow.mailCharacterSet == 'windows-1252') ||
          (msgWindow.mailCharacterSet == '')) ) {
      if (misdetectedRTLCodePage(body)) {
        messenger.SetDocumentCharset(charsetPref);
        msgWindow.mailCharacterSet = charsetPref;
        msgWindow.charsetOverride = true;
      }
    }

  } catch(e) {}

  // Auto detect plain text direction
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  try {
    if (!prefs.getBoolPref("mailnews.message_display.autodetect_direction"))
      return;
  } catch(e) { } // preference is not set.  
  
  // at this point, either the preference specifies autodetection or there
  // is no preference, and autodetection is the default behavior

  // TODO: consider changing the following condition so as to also set the
  // direction of non-plain-text HTML messages without a preset direction
         
  if (canBeAssumedRTL(body)) {
    if (bodyIsPlainText)
      SetMessageDirection('rtl');
    UpdateDirectionButtons('rtl');
  }
  else
    UpdateDirectionButtons('ltr');
}

function OnLoadHandler() {
  var browser = getMessageBrowser();
  if (browser)
    browser.addEventListener('load', browserOnLoadHandler, true);

  // XXXmano: something _must_ be wrong here, but from whatever reason,
  // the timer isn't always fired. at least on the aviary1.0 branch
  try {
    LoadOSAttributeOnWindow();
  }
  catch (e) {
    setTimeout(LoadOSAttributeOnWindow, 0);
  }
}

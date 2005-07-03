// Summary of differences from tbird version:
//
// none, for now!


function SetMessageDirection(dir) {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  body.setAttribute('dir', dir);
}

function SwitchMessageDirection() {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  var currentDir = window.getComputedStyle(body, null).direction;

  if (currentDir == 'rtl')
  {
    body.setAttribute('dir', 'ltr');
  }
  else
  {
    body.setAttribute('dir', 'rtl');
  }
}

function browserOnLoadHandler() {
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

  // Auto-detect some mis-decoded messages
  try {
    var forcePref = false, charsetPref = null;
    var misdecodeAutodetectPref = true;
    try {
      forcePref = gPrefService.getBoolPref("mailnews.force_charset_override");
    } catch(e) {}
    try {
      charsetPref = gPrefService.getCharPref("mailnews.view_default_charset");
    } catch(e) {}
    try {
      misdecodeAutodetectPref = gPrefService.getBoolPref("mailnews.message_display.autodetect_bidi_misdecoding");
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

  // Auto-detect plain text direction
  try
  {
    if (!gPrefService.getBoolPref("mailnews.message_display.autodetect_direction"))
      return;
  } catch(e) { } // preference is not set.  
  
  if (bodyIsPlainText) {
    if (canBeAssumedRTL(body)) {
      SetMessageDirection('rtl');
    }
    return;
  }
  
  // It's an HTML message

  if (!body.getAttribute('dir')) {
    if (canBeAssumedRTL(body)) {
      // the body is has no DIR attribute, but it looks RTLish
      // so let's add an initial stylesheet saying it's RTL,
      // which will be overridden by any other stylesheets within 
      // the document itself
  
      var newSS;
      newSS = this.docShell.contentViewer.DOMDocument.createElement("link");
      newSS.rel  = "stylesheet";
      newSS.type = "text/css";
      newSS.href = "chrome://bidimailpack/content/weakrtl.css";
      head = this.docShell.contentViewer.DOMDocument.getElementsByTagName("head")[0];
      if (head) {
        if (head.firstChild)
          head.insertBefore(newSS,head.firstChild);
        else head.appendChild(newSS);
      }
    }
  }
}

function InstallBrowserHandler() {
  var browser = getMessageBrowser();
  if (browser)
    browser.addEventListener('load', browserOnLoadHandler, true);
}


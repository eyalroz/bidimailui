// workaround for bug 12469
var gMessageURI = null;

function SetMessageDirection(dir)
{
  var brwsr = getMessageBrowser();
  if (!brwsr)
    return;

  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  body.style.direction = dir;
}

function SwitchMessageDirection()
{
  var brwsr = getMessageBrowser();
  if (!brwsr)
    return;

  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  var oppositeDirection =
    window.getComputedStyle(body, null).direction == "ltr" ? "rtl" : "ltr";

  body.style.direction = oppositeDirection;
}

function browserOnLoadHandler()
{
  jsConsoleService.logStringMessage('here');


  var body = this.docShell.contentViewer.DOMDocument.body;
  var bodyIsPlainText = body.childNodes.length > 1
    && body.childNodes[1].className != "moz-text-html"; // either '*-plain' or '*-flowed'

  // quote bar css
  var newSS;
  newSS = this.docShell.contentViewer.DOMDocument.createElement("link");
  newSS.rel  = "stylesheet";
  newSS.type = "text/css";
  newSS.href = "chrome://bidimailpack/content/quotebar.css";
  head = this.docShell.contentViewer.DOMDocument.getElementsByTagName("head")[0];
  if (head)
    head.appendChild(newSS);

  // -- Auto-detect some mis-decoded messages
  // When shall we attempt re-detection and overriding of the character set?
  // not if the encoding has _already_ been overridden (either due to the pref
  // or not) and not if the default charset is not one of the 256-char codepages
  // we expect get mangled, and then only when the charset is reported as one of
  // the defaultish ones (or not reported at all)?
  // Notes:
  // - We don't detect 'false positives' (e.g. we won't detect when a message
  //   which isn't supposed to be windows-1255 has been made windows-1255)
  // - Changing the charset here means that the message is re-loaded, which
  //   calls this function (the onLoad handler) again

  var charsetPref = null;
  try {
    charsetPref =
      gBDMPrefs.prefService.getCharPref("mailnews.view_default_charset");
  }
  catch (ex) { }

  var msgWindow = Components.classes[msgWindowContractID].createInstance();
  msgWindow = msgWindow.QueryInterface(Components.interfaces.nsIMsgWindow);
  if (charsetPref && msgWindow) {
    loadedMessageURI = GetLoadedMessage();
    if (loadedMessageURI != gMessageURI) {
      gMessageURI = loadedMessageURI;
      var misdecodeAutodetectPref =
        gBDMPrefs.getBoolPref("display.autodetect_bidi_misdecoding", true);
      if ( misdecodeAutodetectPref &&
           (charsetPref == "windows-1255" || charsetPref == "windows-1256") &&
           !msgWindow.charsetOverride &&
           (!msgWindow.mailCharacterSet ||
            msgWindow.mailCharacterSet == "US-ASCII" ||
            msgWindow.mailCharacterSet == "ISO-8859-1" ||
            msgWindow.mailCharacterSet == "windows-1252" ||
            msgWindow.mailCharacterSet == "") ) {
        if (misdetectedRTLCodePage(body)) {
          messenger.SetDocumentCharset(charsetPref);
          msgWindow.mailCharacterSet = charsetPref;
          msgWindow.charsetOverride = true;
        }
      }
    }
  } 

  // Auto detect plain text direction
  if (!gBDMPrefs.getBoolPref("display.autodetect_direction", true))
    return;

  if (bodyIsPlainText) {
    if (canBeAssumedRTL(body)) {
      SetMessageDirection("rtl");
    }

    return;
  }
  
  // It's an HTML message

  if (!body.hasAttribute("dir") &&
      window.getComputedStyle(body, null).direction == "ltr" &&
      canBeAssumedRTL(body)) {
    // the body has no DIR attribute and isn't already set to be RTLed,
    // but it looks RTLish, so let's add an initial stylesheet saying it's RTL,
    // which will be overridden by any other stylesheets within 
    // the document itself

    head = this.docShell.contentViewer.DOMDocument
                        .getElementsByTagName("head")[0];
    if (head) {
      var newSS;
      newSS = this.docShell.contentViewer.DOMDocument.createElement("link");
      newSS.rel  = "stylesheet";
      newSS.type = "text/css";
      newSS.href = "chrome://bidimailpack/content/weakrtl.css";
      if (head.firstChild)
        head.insertBefore(newSS,head.firstChild);
      else
        head.appendChild(newSS);
    }
  }
}

function InstallBrowserHandler()
{
  var browser = getMessageBrowser();
  if (browser)
    browser.addEventListener("load", browserOnLoadHandler, true);
}


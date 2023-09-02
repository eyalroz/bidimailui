const EXPORTED_SYMBOLS = [ "BiDiMailUI" ];
var     Services       = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const { XPCOMUtils   } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var BiDiMailUI = { };

//---------------------------------------------------------

BiDiMailUI.Strings = {};

XPCOMUtils.defineLazyGetter(BiDiMailUI.Strings, "bundle",
  () => Services.strings.createBundle("chrome://bidimailui/locale/bidimailui.properties")
);

BiDiMailUI.Strings.format = function (stringName, formatArguments) {
  const args = formatArguments ? Array.from(formatArguments) : [];
  return BiDiMailUI.Strings.bundle.formatStringFromName(`bidimailui.${stringName}`, args);
};

BiDiMailUI.Strings.getByName = (stringName) => BiDiMailUI.Strings.format(stringName, []);

//---------------------------------------------------------

XPCOMUtils.defineLazyGetter(BiDiMailUI, "UnicodeConverter",
  () => Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter)
);

BiDiMailUI.decodeString = function (str, charsetEncoding) {
  BiDiMailUI.UnicodeConverter.charset = charsetEncoding;
  return BiDiMailUI.UnicodeConverter.ConvertToUnicode(str);
};


//---------------------------------------------------------

XPCOMUtils.defineLazyGetter(BiDiMailUI, 'Prefs', () => {
  let Preferences = ChromeUtils.import("resource://gre/modules/Preferences.jsm").Preferences;
  return new Preferences('extensions.bidiui.mail.');
});

XPCOMUtils.defineLazyGetter(BiDiMailUI, 'AppPrefs', () => {
  let Preferences = ChromeUtils.import("resource://gre/modules/Preferences.jsm").Preferences;
  return new Preferences();
});

//---------------------------------------------------------

// Some regexp string constants

BiDiMailUI.RegExpStrings = {};
BiDiMailUI.RegExpStrings.TEXT_SPLIT_SEQUENCE =
 "\\n[ \\f\\r\\t\\v\\n\\u00A0\\u2028\\u2029!-@\\[-`{-\\xA0\\u2013\\u2014\\uFFFD]*\\n";

BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER =
  "[\\xBF-\\xD6\\xD8-\\xFF]";
BiDiMailUI.RegExpStrings.MISDETECTED_RTL_SEQUENCE =
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER + "{2,}";

// TODO: some of these are only relevant for UTF-8 misdecoded as windows-1252
// (or iso-8859-1; mozilla cheats and uses windows-1252), while some of these
// are only relevant for UTF-8 misdecoded as windows-1255

// Rationale: Since we know that this message is a misdecoded RTL-codepage
// message, we assume that every text field with a misdetected RTL 'word' has
// no non-windows-1255 chars and hence can be recoded (plus we relaxed the
// definition of a word)
//
// TODO: I would like to use \b's instead of the weird combination here,
// but for some reason if I use \b's, I don't match the strings EE E4 20 and
// E7 E3 22 F9
BiDiMailUI.RegExpStrings.CODEPAGE_MISDETECTION_SEQUENCE =
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER +
  "{3,}" + "|" +  "(" + "(?:\\s|\"|\W|^)" +
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER +
  "{2,}(?:\"|\\s|\W|$)" + ")";

// TODO: maybe it's better to undecode first, then check whether it's UTF-8;
// that will probably allow using a char range instead of so many individual
// chars
BiDiMailUI.RegExpStrings.MISDETECTED_UTF8_SEQUENCE =

  // Hebrew
  // ------
  "(?:" +
  // just octet sequences...
  "(?:\\xD6[\xB0-\xBF])|" +
  "(?:\\xD7[\x80-\xBF])|" +
  // or windows-1252-ified octet sequences
  "(?:\\xD7(?:[ \\u017E\\u0152\\u0153\\u02DC\\u2013-\\u2022\\u203A\\u2220\\u2122]|&#65533;))" +
  " ?\"?){3}" +
  "|" +

  // Arabic:
  // ------
    "(?:" +
  // just octet sequences...
  "(?:\\xD8[\\x8C-\\xBF])|" +
  "(?:\\xD9[\\x80-\\xB9])|" +
  "(?:\\xEF\\xAD[\\x90-\\xBF])|" +
  "(?:\\xEF[\\xAE-\\xBA][\\x80-\\xBF])|" +
  "(?:\\xEF\\xBB[\\x80-\\xBC])|" +
  // or windows-1252-ified octet sequences
  "(?:\\xD9(?:[ \\u20AC\\u0192\\u02C6\\u0160\\u0161\\u0152\\u0153\\u017D\\u017E\\u0178\\u02DC\\u2026\\u2013-\\u203A\\u2122]|&#65533;))" +
  // ... and at least three characters
  " ?\"?){3}" +
  "|" +

  // Hebrew or Arabic:
  // ------------------
  // just octet sequences - but FFFD instead of D6 or D7, see bug 24175
  "(?:" +
  "(?:\\uFFFD[\x80-\xBF])" +
  // ... and at least four characters, to be on the safe side
  " ?\"?){3}" +
  "|" +

  // while \uFFFD characters are possible when mis-decoding UTF-8 as windows-1252/5/6
  // (e.g. windows-1255 doesn't have \x81 as a character),
  // contiguous sequences of them are highly unlikely,
  // as most relevant Unicode ranges are such that the first UTF-8 byte will be in
  // the ASCII range and therefore not be decoded as \uFFFD
  //
  // (this has been removed from the pattern due to clashing with certain cases in
  //  which charset text is misdecoded as UTF-8 with Mozilla 'cheating', see bug 23322)
  //
  // "\\uFFFD{3,}" +
  // "|" +

  // UTF-8 BOM octets - undecoded
  // (perhaps we should allow these not just at the beginning of the line?)
  "^\\u00EF\\u00BB\\u00BF" +
  "|" +
  // UTF-8 BOM octets - misdecoded as windows-1255
  // (for some reason Mozilla gives up on the \xBF -> \u00BF third character)
  "^\\u05DF\\u00BB[\\u00BF\\uFFFD]" +
  "|" +
  // Non-breaking space
  "(?:\\xC2\\xA0)" +
  "|" +
  // This is heuristic, i.e. you happen to see this sequence here and there
  "(?:\\u05F3[\\u2018-\\u2022\\xA9]){2}";

// TODO: A botched sequence may differ for windows-1252/5/6; also
// the FFFDs might be interspersed with single other characters.
BiDiMailUI.RegExpStrings.BOTCHED_UTF8_DECODING_SEQUENCE =
  "(?:^|\x0A)\\uFFFD{3}";

BiDiMailUI.performCorrectiveRecoding = function (document, NodeFilter, recodingParams) {
  let needAnyRecoding = recodingParams.recodePreferredCharset || recodingParams.recodeUTF8;
  if (!needAnyRecoding) return;

  // TODO: This is the wrong body, I think
  let treeWalker = document.createTreeWalker(recodingParams.body, NodeFilter.SHOW_TEXT);
  let node;
  node = recodingParams.body;
  while ((node = treeWalker.nextNode())) {
    if (node.data) {
      node.data = BiDiMailUI.performCorrectiveRecodingOnText(node.data, recodingParams);
    }
  }
  if (recodingParams.recodeUTF8) {
    recodingParams.body.setAttribute('bidimailui-recoded-utf8', true);
  }
  if (recodingParams.recodePreferredCharset) {
    recodingParams.body.setAttribute(
      'bidimailui-recoded-charset', recodingParams.preferredCharset);
  }

  if (recodingParams.subjectSetter) {
    try {
      recodingParams.subjectSetter(
        BiDiMailUI.performCorrectiveRecodingOnText(recodingParams.messageSubject, recodingParams));
    } catch (ex) { }
  }
};

BiDiMailUI.codepageMisdetectionExpression =
  new RegExp(BiDiMailUI.RegExpStrings.CODEPAGE_MISDETECTION_SEQUENCE);
BiDiMailUI.utf8MisdetectionExpression =
  new RegExp(BiDiMailUI.RegExpStrings.MISDETECTED_UTF8_SEQUENCE);


BiDiMailUI.performCorrectiveRecodingOnText = function (str, correctiveRecodingParams) {
  if (!str || str.length == 0) return null;
  if (!correctiveRecodingParams.recodeUTF8 && !correctiveRecodingParams.recodePreferredCharset) return null;
  let lines = str.split('\n');
  let encoderForUTF8Recoding = (correctiveRecodingParams.recodeUTF8) ? new TextEncoder(
    (correctiveRecodingParams.mailnewsDecodingType === "latin-charset") ?
      'windows-1252' : correctiveRecodingParams.preferredCharset) : null;
  let utf8Decoder = new TextDecoder("UTF-8");
  for (let i = 0; i < lines.length; i++) {
    let workingStr;
    // Note: It's _important_ to check for UTF-8 first, because that has the
    // much more distinctive [D7-D9] blah [D7-D9] blah [D7-D9] blah pattern!
    if (correctiveRecodingParams.recodeUTF8 &&
      BiDiMailUI.utf8MisdetectionExpression.test(lines[i])) {
      try {
        let encoded = encoderForUTF8Recoding.encode(lines[i]);

        // We see a lot of D7 20's instead of D7 A0's which are the 2-byte sequence for
        // the Hebrew letter Nun; I guess some clients or maybe even Mozilla replace A0
        // (a non-breaking space in windows-1252) with 20 (a normal space)
        // workingStr = workingStr.replace(/([\xD7-\xD9])\x20/g, "$1\xA0");
        encoded.forEach((elem, idx, arr) => {
          if (elem >= 0xD7 && elem <= 0xD9 && arr[idx + 1] === 0x20) {
            arr[idx + 1] = 0xA0;
          }
        });

        // remove some higher-than-0x7F characters originating in HTML entities, such as &nbsp;
        // (we remove them only if they're not the second byte of a two-byte sequence; we ignore
        // the possibility of their being part of a 3-to-6-byte sequence)
        // workingStr = workingStr.replace(/(^|[\x00-\xBF])\xA0+/g, "$1 ");
        let processed = [];
        let inSequence = true;
        for (let j = 0; j < encoded.length; j++) {
          if (inSequence) {
            if (encoded[j] === 0xA0) continue;
          } else if (encoded[j] <= 0xBF && j < length - 1 && encoded[j + 1] === 0xA0) {
            inSequence = true;
            continue;
          }
          processed.push(encoded[j]);
        }
        encoded = new Uint8Array(processed);

        // TODO: Re-enable this
/*         // decode any numeric HTML entities ;
        // weird stuff we don't recognize will be replaced with the
        // UTF-8 encoding of a \uFFFD (unicode replacement char)
        workingStr = workingStr.replace(
          /[\xC2-\xDF]*&#(\d+);/g,
          () => {
            let res = String.fromCharCode(RegExp.$1);
            return ((res.charCodeAt(0) > 0xBF) ? "\xEF\xBF\xBD" : res);
          }
        ); */

        // first byte of a two-byte sequence followed by a byte not completing the sequence
        // workingStr = workingStr.replace(/[\xD7-\xD9]([^\x80-\xBF]|$)/g, "$1");

        encoded.filter((e, idx, arr) => {
          if (!(e >= 0xD7 && e <= 0xD9)) return true;
          if (idx == arr.length + 1) return false;
          let nextCharCompletesATwoByteSequence = (arr[idx + 1] >= 0x80 && arr[idx + 1] <= 0xBF);
          return nextCharCompletesATwoByteSequence;
        });
        lines[i] = utf8Decoder.decode(encoded);
      } catch (ex) {
        console.error(`Exception while trying to correct mis-decoded UTF-8 text `
          + `on line ${i}. Line contents:\n${lines[i]}\n\nException info:\n${ex}`);

        // in some cases we seem to get manged UTF-8 text
        // which can be fixed by re-applying the current character set to the message,
        // then recoding if necessary; see
        // https://www.mozdev.org/bugs/show_bug.cgi?id=18707
        if (/(\x3F[20\x90-\xA8]){3,}/.test(workingStr)) {
          correctiveRecodingParams.needCharsetForcing = true;
        }
      }
    } else if (correctiveRecodingParams.recodePreferredCharset &&
      BiDiMailUI.codepageMisdetectionExpression.test(lines[i])) {
      try {
        // at this point, correctiveRecodingParams.mailnewsDecodingType can only be latin or UTF-8
        lines[i] = BiDiMailUI.decodeString(lines[i], correctiveRecodingParams.preferredCharset);
      } catch (ex) {
        console.error(`Exception while trying to correct mis-decoded ${correctiveRecodingParams.preferredCharset} text `
          + `on line ${i}.Line contents:\n${lines[i]}\n\nException info:\n${ex}`);
      }
    }
  }
  return lines.join('\n');
};

BiDiMailUI.textMatches = function (document, NodeFilter, element, expression) {
  let treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node;
  while (node = treeWalker.nextNode()) {
    if (expression.test(node.data)) { return true; }
  }
  return false;
};

BiDiMailUI.determineTextMatchUniformity = function (document, NodeFilter, element, expression) {
  let treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let hasMatching_ = false, hasNonMatching_ = false;
  let node;
  while (node = treeWalker.nextNode()) {
    if (expression.test(node.data)) { hasMatching_ = true; if (hasNonMatching_) break; }
    else { hasNonMatching_ = true; if (hasMatching_) break; }
  }
  return { hasMatching : hasMatching_, hasNonMatching : hasNonMatching_ };
};

BiDiMailUI.neutralsOnly = function (str) {
  const neutrals =
    new RegExp("^[ \\f\\r\\n\\t\\v\\u00A0\\u2028\\u2029!-@\[-`\{-\xA0\u2013\\u2014\\uFFFD]*$");
  return neutrals.test(str);
};


// returns "rtl", "ltr", "neutral" or "mixed"; but only an element
// with more than one text node can be mixed
BiDiMailUI.directionCheck = function (document, NodeFilter, obj) {
  const RTL_CHARACTER_INNER =
   "\\u0590-\\u05FF\\uFB1D-\\uFB4F\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFC";
  const RTL_CHARACTER = "[" + RTL_CHARACTER_INNER + "]";
  const RTL_SEQUENCE = "(?:" +  RTL_CHARACTER + "{2,}|" + RTL_CHARACTER + "\"" +
           RTL_CHARACTER + ")";
  const LTR_SEQUENCE = "(?:" +  "\\w" + "[\\-@\\.']?" + ")" + "{2,}";
  const NEUTRAL_CHARACTER_INNER =
    " \\f\\r\\t\\v\\u00A0\\u2028\\u2029!-@\[-`\{-\xA0\u2013\\u2014\\uFFFD";
  const NEUTRAL_CHARACTER = "[" + NEUTRAL_CHARACTER_INNER + "]";
  const NEUTRAL_CHARACTER_NEW_LINE = "[\\n" + NEUTRAL_CHARACTER_INNER + "]";
  const IGNORABLE_CHARACTER = "[" + NEUTRAL_CHARACTER_INNER +
    RTL_CHARACTER_INNER + "]";
  const IGNORABLE_CHARACTER_NEW_LINE = "[" + NEUTRAL_CHARACTER_INNER +
    RTL_CHARACTER_INNER + "\\n]";


  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  // note we're allowing sequences of initials, e.g W"ERBEH
  const allNeutralExpression = new RegExp(
    "^" + NEUTRAL_CHARACTER_NEW_LINE + "*" + "$");
  const rtlLineExpression = new RegExp(
    // either the text has no non-RTL characters and some RTL characters
    "(?:" + "^" + IGNORABLE_CHARACTER_NEW_LINE + "*" + RTL_CHARACTER + IGNORABLE_CHARACTER_NEW_LINE + "*" + "$" + ")" +
    "|" +
    // or it has only one non-RTL 'word', with an RTL 'word' before it
    "(?:" + "^" + IGNORABLE_CHARACTER + "*" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "+" + LTR_SEQUENCE + IGNORABLE_CHARACTER + "*" +  "$" + ")" +
    "|" +
    // or it has only one non-RTL 'word', with an RTL 'word' after it
    "(?:" + "^" + IGNORABLE_CHARACTER + "*" + LTR_SEQUENCE + IGNORABLE_CHARACTER + "+" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "*" +  "$" + ")" +
    "|" +
    // or it has a line with two RTL 'words' before any non-RTL characters
    "(?:" + "(^|\\n)" + IGNORABLE_CHARACTER + "*" + RTL_SEQUENCE + NEUTRAL_CHARACTER + "+" + RTL_SEQUENCE + ")" +
    "|" +
    // or it has a line with two RTL 'words' after all non-RTL characters
    "(?:" + RTL_SEQUENCE + NEUTRAL_CHARACTER + "+" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "*" + "($|\\n)" + ")");

  if (typeof obj == 'string') {
    if (allNeutralExpression.test(obj)) {
      return "neutral";
    }
    return (rtlLineExpression.test(obj) ? "rtl" : "ltr");
  }
  // it's a DOM node
  if (allNeutralExpression.test(obj.textContent)) {
    return "neutral";
  }
  let matchResults = BiDiMailUI.determineTextMatchUniformity(document, NodeFilter, obj, rtlLineExpression);
  if (matchResults.hasMatching && matchResults.hasNonMatching) { return "mixed"; }
  return (matchResults.hasMatching) ? "rtl" : "ltr";
};

BiDiMailUI.getMessageEditor = function (document) {
  return document.getElementById("messageEditor");
};


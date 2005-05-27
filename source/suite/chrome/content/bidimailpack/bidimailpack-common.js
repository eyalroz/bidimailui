// Summary of differences from tbird version:
//
// none, for now!

function hasRTLWord(element) {

  // we check whether there exists a line whose first word
  // consists solely of characters of an RTL script (excluding any
  // punctuation/spacing/numbering at the beginning of the line)

  // we use definitions from nsBiDiUtils.h as the criteria for BiDi text;
  // cf. the macros IS_IN_BMP_RTL_BLOCK and IS_RTL_PRESENTATION_FORM
  
  var re = /^(\s|[<>\.;,:0-9])*([\u0590-\u08FF]|[\uFB1D-\uFDFF]|[\uFE70-\uFEFC])+/;

  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("//text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (re.test(node.data))
      return true;
    }
  } catch (e) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we do:
    if (re.test(element.innerHTML))
      return true;
  }
  return false;
}

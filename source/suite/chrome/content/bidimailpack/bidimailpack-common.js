// Summary of differences from tbird version:
//
// none, for now!

function hasRTLWord(element) {

  // we check whether there exists a complete word in the element text
  // consisting solely of characters of an RTL script

  // we use definitions from nsBiDiUtils.h as the criteria for BiDi text;
  // cf. the macros IS_IN_BMP_RTL_BLOCK and IS_RTL_PRESENTATION_FORM
  
  var re = /(^|\s|[<>\.;,:])([\u0590-\u08FF]|[\uFB1D-\uFDFF]|[\uFE70-\uFEFC])+($|\s|[<>\.;,:])/;

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

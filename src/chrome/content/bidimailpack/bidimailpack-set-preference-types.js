// Note: This code is only relevant for Thunderbird versions 68 and later,
// where we can no longer use the XUL Preference element.

Preferences.addAll([
  { id: "extensions.bidiui.mail.compose.default_direction",                   type: "string" },
  { id: "extensions.bidiui.mail.compose.reply_in_default_direction",          type: "bool"   },
  { id: "extensions.bidiui.mail.compose.show_direction_buttons",              type: "bool"   },
  { id: "extensions.bidiui.mail.compose.start_composition_in_paragraph_mode", type: "bool"   },
  { id: "extensions.bidiui.mail.compose.space_between_paragraphs.value",      type: "string" },
  { id: "extensions.bidiui.mail.compose.space_between_paragraphs.scale",      type: "string" },
]);

// Note: the space between paragraph value preferences are linked, and 
// we should try calling BiDiMailUI.PrefPane.updateSpaceBetweenParagraphsValue()
// whenever one of the two prefs change.

mergeInto(LibraryManager.library, {
  MathscriptReportSnapshot: function (json) {
    window.mathscriptSnapshot = JSON.parse(UTF8ToString(json));
  }
});
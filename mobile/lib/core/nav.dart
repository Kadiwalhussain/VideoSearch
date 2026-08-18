/// In-app vault routes. Marks/shots/play stay here — YouTube app is optional.
String videoLocation(
  String videoId, {
  String? tab,
  String? mark,
  String? shot,
  num? t,
}) {
  return Uri(
    path: '/video/$videoId',
    queryParameters: {
      if (tab != null && tab.isNotEmpty) 'tab': tab,
      if (mark != null && mark.isNotEmpty) 'mark': mark,
      if (shot != null && shot.isNotEmpty) 'shot': shot,
      if (t != null) 't': '${t.floor()}',
    },
  ).toString();
}

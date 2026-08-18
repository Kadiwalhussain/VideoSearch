import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

/// Official YouTube IFrame player (inline, no leave-to-YouTube).
const vaultPlayerParams = YoutubePlayerParams(
  showControls: true,
  showFullscreenButton: true,
  playsInline: true,
  strictRelatedVideos: true,
  color: 'red',
  origin: 'https://www.youtube-nocookie.com',
);

YoutubePlayerController createVaultPlayer({
  required String videoId,
  double startSeconds = 0,
  bool autoPlay = false,
}) {
  return YoutubePlayerController.fromVideoId(
    videoId: videoId,
    autoPlay: autoPlay,
    startSeconds: startSeconds > 0 ? startSeconds : null,
    params: vaultPlayerParams,
  );
}

class VaultYoutubePlayer extends StatelessWidget {
  final YoutubePlayerController controller;

  const VaultYoutubePlayer({super.key, required this.controller});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: YoutubePlayer(
        controller: controller,
        aspectRatio: 16 / 9,
      ),
    );
  }
}

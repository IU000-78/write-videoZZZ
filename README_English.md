# Video Prompt Director

Turn story beats, visual ideas, and revision notes into shot-by-shot prompts for AI video generation. Designed for workflows using Seedance / SD and similar tools, with a focus on cinematic staging, spatial clarity, action continuity, and common visual errors.

[中文](自述文件_中文.md) · **English** · [Русский](Описание_Русский.md)

## Features

- **Story-to-shot design:** Develop composition, blocking, and emotional progression while preserving the core plot, character relationships, supplied dialogue, and outcome.
- **Intent questions and camera choices:** Ask 1–3 key questions for a new sequence. If camera movement is unspecified, offer three suitable options after the answers.
- **Camera and sound planning:** Describe shot size, focal length, camera position and movement, lighting, performance, dialogue, and ambience as needed.
- **Continuity review:** Check screen direction, eyelines, character awareness, physical contact, prop ownership, door and window states, and consistent lighting.
- **Additional shots and targeted revisions:** Carry forward confirmed settings and keep edits within the requested scope.
- **Diagrams when useful:** Include blocking and camera diagrams when medium or wide shots require spatial explanation. Close-ups may omit them. Ask before creating VFX blockout references.

## Defaults

- Write video prompts in Chinese and preserve the supplied dialogue language. Do not rewrite, add, or automatically translate dialogue without instruction.
- Number shots as `镜号1`, `镜号2`, etc. Omit per-shot durations unless explicitly requested; do not proactively ask whether to add them.
- Use no BGM, added subtitles, or watermarks by default. Explicit current instructions take priority.
- Preserve character asset names, established project settings, and limits on targeted edits.
- Review aims to reduce common generation errors; it cannot guarantee a flawless first generation.

## Download and installation

1. Open this repository's [Releases page](https://github.com/IU000-78/write-videoZZZ/releases).
2. Under Assets, download the publisher-attached `write-video-prompts-plugin.zip`.
3. In a ChatGPT / Codex environment that supports plugin ZIP imports, upload the ZIP through its plugin import interface.
4. Select Video Prompt Director and provide a story, reference material, or prompts to revise.

Installation controls depend on the client. The plugin requires an AI environment with skill support. GitHub stores and distributes the files; it does not run AI video generation.

## Example requests

**Create a sequence**

> Use Video Prompt Director to turn the following story into shot-by-shot prompts for Seedance. Confirm the creative intent first. If camera movement is unspecified, offer three options. Preserve the dialogue and omit durations by default.

**Review continuity**

> Check the prompts below for spatial consistency, screen direction, character awareness, and action continuity. Identify definite problems first, then suggest revisions without changing the core plot.

**Make a targeted revision**

> Change only shot 3: the character turns before speaking, and the double doors in the background remain fully closed. Keep all other settings, shot numbers, and dialogue unchanged.

The skill produces Chinese video prompts by default. The English and Russian READMEs translate the project documentation; they do not establish full multilingual support for the skill.

## Repository structure

- `plugin.json`: Plugin configuration.
- `skills/write-video-prompts/SKILL.md`: Core skill instructions.
- `skills/write-video-prompts/references/`: Directing, camera, continuity, and review references.
- `skills/write-video-prompts/scripts/`: Supporting scripts.
- `skills/write-video-prompts/assets/`: Icons and templates.

## Feedback and license

When reporting a problem, include the task goal, original prompts, expected outcome, and observed issue. Describe relevant reference material where needed. Do not submit passwords or API keys.

See [LICENSE](LICENSE) for license terms.

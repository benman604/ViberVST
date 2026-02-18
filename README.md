# Viber - MIDI visualizer VST plugin 

A silly VST plugin for visualizing MIDI notes.


### Installation

- Install [JUCE](https://juce.com/tutorials/tutorial_new_projucer_project/) and open `Viber.jucer` in Projucer
- Open the project in your IDE and build for target VST3
- Once the build finishes, copy `Builds/[MacOSX or Windows]/build/Debug/Viber.vst3` to your native VST3 directory (`~/Library/Audio/Plug-Ins/VST3` on MacOS)
- Open your DAW, then add Viber as an instrument. Set the input of the track to the track which you wish to visualize.

To allow Viber to read both audio and MIDI data:
- Add Viber to an empty MIDI track
- Set MIDI from to the instrument you wish to visualize MIDI 
- Set Monitor to In
- In Viber, set Sidechain to the instrument you wish to visualize audio waveform
/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin editor.

  ==============================================================================
*/

#pragma once

#include <JuceHeader.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

using namespace juce;

//==============================================================================
/**
*/

class ViberAudioProcessorEditor  :
    public juce::AudioProcessorEditor,
    public juce::Timer
{
public:
    ViberAudioProcessorEditor (ViberAudioProcessor&);
    ~ViberAudioProcessorEditor() override;

    //==============================================================================
    void paint (juce::Graphics&) override;
    void resized() override;
    
    void timerCallback() override;

    void sendNoteChangeEvent(const juce::String& noteName);
    void sendNoteOffEvent(const juce::String& noteName);

private:
    // This reference is provided as a quick way for your editor to
    // access the processor object that created it.
    ViberAudioProcessor& audioProcessor;
    
    juce::Label midiNoteDisplayLabel;
    juce::TextButton runJsBtn{"Run JS"};
    
    juce::WebBrowserComponent webView;

    using Resource = juce::WebBrowserComponent::Resource;
    std::optional<Resource> getResource(const juce::String& url);

    const juce::Identifier broadcast_note_change_event{"notechange"};
    const juce::Identifier broadcast_note_off_event{"noteoff"};
    const juce::Identifier broadcast_fft_data{"fftframe"};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ViberAudioProcessorEditor)
};

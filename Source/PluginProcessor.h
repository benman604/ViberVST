/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin processor.

  ==============================================================================
*/

#pragma once

#include <JuceHeader.h>

//==============================================================================
/**
*/
class ViberAudioProcessor  : public juce::AudioProcessor
{
public:
    //==============================================================================
    ViberAudioProcessor();
    ~ViberAudioProcessor() override;

    //==============================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

   #ifndef JucePlugin_PreferredChannelConfigurations
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
   #endif

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==============================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;
    // ViberAudioProcessorEditor* editorRef;

    //==============================================================================
    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    //==============================================================================
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    //==============================================================================
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;
    
    int lastMidiNoteNumber = -1;
    juce::String lastMidiNoteName;
    
    const int fftOrder = 10;
    const size_t fftSize = 1 << fftOrder;
    
    juce::dsp::FFT fft { fftOrder }; // e.g. fftOrder = 10 → 1024 samples
    std::vector<float> fftWindow;    // Holds latest time-domain samples
    std::vector<float> fftInput;     // Zero-padded input buffer
    std::vector<float> fftMagnitudes;
    std::vector<std::complex<float>> fftOutput; // Output after FFT
    juce::dsp::WindowingFunction<float> window { fftSize, juce::dsp::WindowingFunction<float>::hann };
    std::atomic<bool> fftReady = false;
    
    void pushNextSampleIntoFifo(float sample);
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

private:
    //==============================================================================
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ViberAudioProcessor)
    int fifoIndex = 0;
    
    juce::AudioParameterFloat* gain;
    std::atomic<float>* gainParam = nullptr;

    juce::AudioProcessorValueTreeState parameters;
};

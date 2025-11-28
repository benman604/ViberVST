/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin processor.

  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
ViberAudioProcessor::ViberAudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
     : AudioProcessor (BusesProperties()
                     #if ! JucePlugin_IsMidiEffect
                      #if ! JucePlugin_IsSynth
                       .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                      #endif
                       .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                     #endif
                       )
#endif
{
    fftInput.resize(fftSize * 2, 0.0f);
    fftMagnitudes.resize(fftSize / 2, 0.0f);
    fft = juce::dsp::FFT(fftOrder);
}

ViberAudioProcessor::~ViberAudioProcessor()
{
}

//==============================================================================
const juce::String ViberAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool ViberAudioProcessor::acceptsMidi() const
{
   #if JucePlugin_WantsMidiInput
    return true;
   #else
    return false;
   #endif
}

bool ViberAudioProcessor::producesMidi() const
{
   #if JucePlugin_ProducesMidiOutput
    return true;
   #else
    return false;
   #endif
}

bool ViberAudioProcessor::isMidiEffect() const
{
   #if JucePlugin_IsMidiEffect
    return true;
   #else
    return false;
   #endif
}

double ViberAudioProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int ViberAudioProcessor::getNumPrograms()
{
    return 1;   // NB: some hosts don't cope very well if you tell them there are 0 programs,
                // so this should be at least 1, even if you're not really implementing programs.
}

int ViberAudioProcessor::getCurrentProgram()
{
    return 0;
}

void ViberAudioProcessor::setCurrentProgram (int index)
{
}

const juce::String ViberAudioProcessor::getProgramName (int index)
{
    return {};
}

void ViberAudioProcessor::changeProgramName (int index, const juce::String& newName)
{
}

//==============================================================================
void ViberAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    // Use this method as the place to do any pre-playback
    // initialisation that you need..
}

void ViberAudioProcessor::releaseResources()
{
    // When playback stops, you can use this as an opportunity to free up any
    // spare memory, etc.
}

#ifndef JucePlugin_PreferredChannelConfigurations
bool ViberAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
  #if JucePlugin_IsMidiEffect
    juce::ignoreUnused (layouts);
    return true;
  #else
    // This is the place where you check if the layout is supported.
    // In this template code we only support mono or stereo.
    // Some plugin hosts, such as certain GarageBand versions, will only
    // load plugins that support stereo bus layouts.
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    // This checks if the input layout matches the output layout
   #if ! JucePlugin_IsSynth
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
   #endif

    return true;
  #endif
}
#endif

void ViberAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    // Read and send MIDI data to frontend
    for (const auto metadata : midiMessages) {
        auto message = metadata.getMessage();

        juce::AudioProcessorEditor* editor = getActiveEditor();
        auto* myeditor = dynamic_cast<ViberAudioProcessorEditor*>(editor);
        
        if (myeditor != nullptr) {
            lastMidiNoteNumber = message.getNoteNumber();
            lastMidiNoteName = juce::MidiMessage::getMidiNoteName(lastMidiNoteNumber, true, true, true);
            if (message.isNoteOn()) {
                myeditor->sendNoteChangeEvent(lastMidiNoteName);
            }
            else if (message.isNoteOff()) {
                myeditor->sendNoteOffEvent(lastMidiNoteName);
            }
        }
    }
    
    // Process audio buffer
    auto* channelData = buffer.getReadPointer(0);
    int numSamples = buffer.getNumSamples();
    
    for (int i=0; i<numSamples; i++) {
        pushNextSampleIntoFifo(channelData[i]);
    }
}

void ViberAudioProcessor::pushNextSampleIntoFifo(float sample) {
    fftInput[fifoIndex++] = sample;

    if (fifoIndex == fftSize) {
        fifoIndex = 0;

        // Apply window
        window.multiplyWithWindowingTable(fftInput.data(), fftSize);

        // Perform FFT (magnitude only)
        fft.performFrequencyOnlyForwardTransform(fftInput.data());

        // Store magnitudes
        for (int i = 0; i < fftSize / 2; ++i)
            fftMagnitudes[i] = fftInput[i];

        fftReady.store(true);
    }
}




//==============================================================================
bool ViberAudioProcessor::hasEditor() const
{
    return true; // (change this to false if you choose to not supply an editor)
}

juce::AudioProcessorEditor* ViberAudioProcessor::createEditor()
{
    return new ViberAudioProcessorEditor (*this);
    // return editorRef; // Return a new instance of your editor class
}

//==============================================================================
void ViberAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    // You should use this method to store your parameters in the memory block.
    // You could do that either as raw data, or use the XML or ValueTree classes
    // as intermediaries to make it easy to save and load complex data.
    
    juce::MemoryOutputStream mos (destData, true);
    mos.writeInt(lastMidiNoteNumber);
    mos.writeString(lastMidiNoteName);
}

void ViberAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    // You should use this method to restore your parameters from this memory block,
    // whose contents will have been created by the getStateInformation() call.
    
    juce::MemoryInputStream mis (data, sizeInBytes, false);
    lastMidiNoteNumber = mis.readInt();
    lastMidiNoteName = mis.readString();
}

//==============================================================================
// This creates new instances of the plugin..
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ViberAudioProcessor();
}

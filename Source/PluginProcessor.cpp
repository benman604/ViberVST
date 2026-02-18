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
                       .withInput("Input", juce::AudioChannelSet::stereo(), true)
                       .withOutput("Output", juce::AudioChannelSet::stereo(), true)
//                     #if ! JucePlugin_IsMidiEffect
//                                            #if ! JucePlugin_IsSynth
//                                             .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
//                                            #endif
//                                             // Always expose a sidechain input so synth builds can receive audio
//                                             .withInput  ("Sidechain", juce::AudioChannelSet::stereo(), true)
//                                             .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
//                     #endif
                       ),
    parameters (*this, nullptr, "PARAMS", createParameterLayout())
#endif
{
    fftInput.resize(fftSize * 2, 0.0f);
    fftMagnitudes.resize(fftSize / 2, 0.0f);
    fftDisplay.resize(fftSize / 2, 0.0f);
    fft = juce::dsp::FFT(fftOrder);
    
    gainParam = parameters.getRawParameterValue("gain");
}

ViberAudioProcessor::~ViberAudioProcessor()
{
}

juce::AudioProcessorValueTreeState::ParameterLayout
ViberAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.push_back (std::make_unique<juce::AudioParameterFloat>(
        "gain", "Gain",
        0.0f, 1.0f, 0.5f
    ));

    return { params.begin(), params.end() };
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

        // For synth plugins we allow an output bus with a sidechain input.
     #if JucePlugin_IsSynth
        juce::ignoreUnused (layouts);
        // Accept stereo/mono output; sidechain input layout is handled by the host.
     #else
        // This checks if the input layout matches the output layout for non-synth plugins
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
    int midiCount = 0;
    for (const auto metadata : midiMessages)
        ++midiCount;
    DBG("processBlock MIDI message count = " << midiCount);

    int printed = 0;
    for (const auto metadata : midiMessages) {
        auto message = metadata.getMessage();

        if (printed < 8) {
            DBG("MIDI msg: " << message.getDescription());
            ++printed;
        }

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
    
    // Process audio buffer: mix all available input channels and feed into FFT FIFO
    int numSamples = buffer.getNumSamples();
    int numInputCh = juce::jmax(1, totalNumInputChannels);

    for (int sampleIndex = 0; sampleIndex < numSamples; ++sampleIndex) {
        float mixed = 0.0f;
        for (int ch = 0; ch < numInputCh; ++ch) {
            mixed += buffer.getReadPointer(ch)[sampleIndex];
        }
        mixed /= static_cast<float>(numInputCh);
        pushNextSampleIntoFifo(mixed);
    }
}

void ViberAudioProcessor::pushNextSampleIntoFifo(float sample) {
    fftInput[fifoIndex++] = sample;

    if (fifoIndex == static_cast<int>(fftSize)) {
        fifoIndex = 0;

        // Apply window to the real samples (first fftSize elements)
        window.multiplyWithWindowingTable(fftInput.data(), static_cast<int>(fftSize));

        // Zero the imaginary / upper half to ensure a clean real-valued FFT input
        if (fftInput.size() >= fftSize * 2) {
            std::fill(fftInput.begin() + fftSize, fftInput.begin() + fftSize * 2, 0.0f);
        }

        // Perform FFT (in-place, frequency-only optimized output)
        fft.performFrequencyOnlyForwardTransform(fftInput.data());

        // Store magnitudes (first fftSize/2 bins) and compute normalized display values
        for (size_t i = 0; i < fftSize / 2; ++i) {
            const float mag = fftInput[i];
            fftMagnitudes[i] = mag;
            // Convert to dB and normalize to [0,1] where -100 dB -> 0, 0 dB -> 1
            const float safe = std::max(mag, 1e-8f);
            const float db = 20.0f * std::log10(safe);
            float norm = (db + 100.0f) / 100.0f;
            if (norm < 0.0f) norm = 0.0f;
            if (norm > 1.0f) norm = 1.0f;
            if (fftDisplay.size() < fftMagnitudes.size()) fftDisplay.resize(fftMagnitudes.size(), 0.0f);
            fftDisplay[i] = norm;
        }

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

/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin editor.

  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace {
const char* getMimeForExtension (const String& extension)
{
    static const std::unordered_map<String, const char*> mimeMap =
    {
        { { "htm"   },  "text/html"                },
        { { "html"  },  "text/html"                },
        { { "txt"   },  "text/plain"               },
        { { "jpg"   },  "image/jpeg"               },
        { { "jpeg"  },  "image/jpeg"               },
        { { "svg"   },  "image/svg+xml"            },
        { { "ico"   },  "image/vnd.microsoft.icon" },
        { { "json"  },  "application/json"         },
        { { "png"   },  "image/png"                },
        { { "css"   },  "text/css"                 },
        { { "map"   },  "application/json"         },
        { { "js"    },  "text/javascript"          },
        { { "woff2" },  "font/woff2"               }
    };

    if (const auto it = mimeMap.find (extension.toLowerCase()); it != mimeMap.end())
        return it->second;

    jassertfalse;
    return "";
}

auto streamToVector (InputStream& stream)
{
    std::vector<std::byte> result ((size_t) stream.getTotalLength());
    stream.setPosition (0);
    [[maybe_unused]] const auto bytesRead = stream.read (result.data(), result.size());
    jassert (bytesRead == (ssize_t) result.size());
    return result;
}
} // namespace

//==============================================================================
ViberAudioProcessorEditor::ViberAudioProcessorEditor (ViberAudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p),
    webView{juce::WebBrowserComponent::Options{}
            .withNativeFunction("resizeTo", [&] (auto& params, auto complete) {
                const auto w = (double) params[0];
                const auto h = (double) params[1];
                setSize((int) w, (int) h);
            })
            .withResourceProvider([this](const auto& url) {
                return getResource(url);
            })
            .withNativeIntegrationEnabled()
    }
{
    setSize (700, 200);
    setResizable(true, false);
    
    // Add the webview
    // webView.goToURL("https://editor.p5js.org/benman604/full/lL8UyeZrz");
    webView.goToURL(webView.getResourceProviderRoot());
    addAndMakeVisible(webView);

//    addAndMakeVisible(midiNoteDisplayLabel);
//    addAndMakeVisible(runJsBtn);
    runJsBtn.onClick = [this] {
        // test 1: evaluate JS in webview
        constexpr auto JS_TO_RUN{"console.log('hi from c++')"};
        webView.evaluateJavascript(JS_TO_RUN, [](juce::WebBrowserComponent::EvaluationResult result) {
            if (const auto* resptr = result.getResult()) {
                std::cout << "eval result " << resptr->toString() << std::endl;
            } else {
                std::cout << "eval failed " << result.getError()->message << std::endl;
            }
        });

        // test 2: emit JS event in webview
        static const juce::Identifier EVENT_ID{"event"};
        webView.emitEventIfBrowserIsVisible(EVENT_ID, "hai");
    };

    startTimerHz(30); // Update 30 times per second (adjust as needed)
}

ViberAudioProcessorEditor::~ViberAudioProcessorEditor()
{
    stopTimer();
}

//==============================================================================
void ViberAudioProcessorEditor::paint (juce::Graphics& g)
{
    // empty paint method
}

void ViberAudioProcessorEditor::timerCallback() {
    // This method is called periodically by the timer.
    // Check if the last MIDI note has changed and update the label.
    if (audioProcessor.lastMidiNoteNumber != -1) {
        midiNoteDisplayLabel.setText (audioProcessor.lastMidiNoteName, juce::dontSendNotification);
    } else {
        midiNoteDisplayLabel.setText ("No MIDI Input !!!! lol change works", juce::dontSendNotification);
    }
    
    auto* proc = dynamic_cast<ViberAudioProcessor*>(&processor);
    
    if (proc != nullptr && proc->fftReady.load()) {
        proc->fftReady.store(false);
        juce::String data;
        for (float mag : proc->fftMagnitudes) {
            data += juce::String(mag) + ",";
        }
        
        if (data.endsWith(",")) {
            data = data.dropLastCharacters(1);
        }
        
        webView.emitEventIfBrowserIsVisible(broadcast_fft_data, data);
    }
    
    repaint();
}

void ViberAudioProcessorEditor::sendNoteChangeEvent(const juce::String& noteName)
{
    // Emit a custom event to the webview
    webView.emitEventIfBrowserIsVisible(broadcast_note_change_event, noteName);
}

void ViberAudioProcessorEditor::sendNoteOffEvent(const juce::String& noteName)
{
    webView.emitEventIfBrowserIsVisible(broadcast_note_off_event, noteName);
}

void ViberAudioProcessorEditor::resized()
{
    auto bounds = getLocalBounds();
    webView.setBounds(bounds);
//    midiNoteDisplayLabel.setBounds(bounds.removeFromTop(50).reduced(5));
//    runJsBtn.setBounds(bounds.removeFromTop(50).reduced(5));
}

auto ViberAudioProcessorEditor::getResource(const juce::String& url) -> std::optional<Resource> {
    static const auto resourceFileRoot = juce::File("/Users/benjaminman/Desktop/dev/juce/Viber/Frontend/public");

    const auto resourceToRetrieve = url == "/" ? "index.html" : url.fromFirstOccurrenceOf("/", false, false);
    const auto resoruce = resourceFileRoot.getChildFile(resourceToRetrieve).createInputStream();

    if (resoruce) {
        const auto extension = resourceToRetrieve.fromLastOccurrenceOf(".", false, false);
        return Resource{streamToVector(*resoruce), getMimeForExtension(extension)};
    }

    return std::nullopt;
}

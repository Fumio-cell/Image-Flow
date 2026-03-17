export const getAudioData = async (file: File): Promise<{ duration: number; peaks: number[] }> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const fallbackAudio = new Audio(objectUrl);
        let fallbackTriggered = false;

        const triggerFallback = () => {
            if (fallbackTriggered) return;
            fallbackTriggered = true;
            fallbackAudio.onloadedmetadata = () => {
                const duration = fallbackAudio.duration * 1000;
                resolve({
                    duration,
                    peaks: new Array(1000).fill(0.1) // Flat line mockup when decode fails
                });
            };
            fallbackAudio.onerror = () => reject(new Error("Audio load failed entirely"));
        };

        // If Web Audio API takes longer than 3 seconds, abort and use fallback
        const timeoutId = setTimeout(triggerFallback, 3000);

        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;

                    audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
                        if (fallbackTriggered) return;
                        clearTimeout(timeoutId);

                        // Extract peaks
                        const channelData = audioBuffer.getChannelData(0);
                        const samples = 1000;
                        const blockSize = Math.floor(channelData.length / samples);
                        const peaks = new Array(samples);
                        for (let i = 0; i < samples; i++) {
                            let max = 0;
                            for (let j = 0; j < Math.max(1, blockSize); j++) {
                                const val = Math.abs(channelData[i * blockSize + j] || 0);
                                if (val > max) max = val;
                            }
                            peaks[i] = max;
                        }

                        resolve({ duration: audioBuffer.duration * 1000, peaks });
                    }, (err) => {
                        console.warn("decodeAudioData failed, triggering fallback", err);
                        triggerFallback();
                    });

                } catch (err) {
                    console.warn("ArrayBuffer processing failed", err);
                    triggerFallback();
                }
            };
            reader.onerror = () => {
                console.warn("FileReader failed");
                triggerFallback();
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.warn("AudioContext unsupported/failed", err);
            triggerFallback();
        }
    });
};

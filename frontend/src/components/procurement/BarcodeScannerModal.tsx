import {
  Box,
  Button,
  Center,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text
} from "@chakra-ui/react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

type BarcodeScannerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
};

export const BarcodeScannerModal = ({ isOpen, onClose, onDetected }: BarcodeScannerModalProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [errorMessage, setErrorMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  }, [onClose, onDetected]);

  useEffect(() => {
    if (!isOpen || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    detectedRef.current = false;
    setErrorMessage("");
    setCameraReady(false);
    const reader = new BrowserMultiFormatReader();
    let disposed = false;

    const stopCamera = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video.srcObject) {
        video.srcObject = null;
      }
    };

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("UNSUPPORTED_CAMERA");
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        } catch (preferredCameraError) {
          if (preferredCameraError instanceof DOMException && preferredCameraError.name === "NotAllowedError") {
            throw preferredCameraError;
          }
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        if (disposed) {
          stopCamera();
          return;
        }
        setCameraReady(true);

        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (!result || detectedRef.current || disposed) {
            return;
          }
          const barcode = result.getText().trim();
          if (!barcode) {
            return;
          }
          detectedRef.current = true;
          stopCamera();
          onDetectedRef.current(barcode);
          onCloseRef.current();
        });

        if (disposed) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (error) {
        if (!disposed) {
          stopCamera();
          const errorName = error instanceof DOMException ? error.name : "";
          setErrorMessage(
            errorName === "NotAllowedError"
              ? "Camera permission is blocked. Open Chrome site settings, allow Camera, then tap Retry."
              : "Camera could not start. Close other camera apps, check permission, then tap Retry."
          );
        }
      }
    };

    void startCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, [isOpen, retryKey]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "lg" }} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Scan Product Barcode</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Box position="relative" borderRadius="16px" overflow="hidden" bg="#111" minH={{ base: "250px", md: "280px" }}>
            <Box
              as="video"
              ref={videoRef}
              autoPlay
              muted
              playsInline
              w="100%"
              minH={{ base: "250px", md: "280px" }}
              maxH={{ base: "55vh", md: "420px" }}
              objectFit="cover"
            />
            {!cameraReady && !errorMessage ? (
              <Center position="absolute" inset={0} flexDirection="column" gap={3} color="white">
                <Spinner thickness="3px" />
                <Text fontSize="sm">Starting rear camera...</Text>
              </Center>
            ) : null}
            {cameraReady ? (
              <Box
                position="absolute"
                left="10%"
                right="10%"
                top="38%"
                h="24%"
                border="2px solid white"
                borderRadius="12px"
                boxShadow="0 0 0 999px rgba(0,0,0,0.25)"
                pointerEvents="none"
              />
            ) : null}
          </Box>
          <Text mt={3} fontSize="sm" color={errorMessage ? "red.600" : "#6F594F"}>
            {errorMessage || "Point the rear camera at the barcode printed on the product packet."}
          </Text>
          {errorMessage ? (
            <Button mt={3} w={{ base: "full", md: "auto" }} onClick={() => setRetryKey((value) => value + 1)}>
              Retry Camera
            </Button>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

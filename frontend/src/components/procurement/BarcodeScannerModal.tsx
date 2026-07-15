import {
  Box,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
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
  const detectedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen || !videoRef.current) {
      return;
    }

    detectedRef.current = false;
    setErrorMessage("");
    const reader = new BrowserMultiFormatReader();
    let disposed = false;

    void reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || detectedRef.current || disposed) {
            return;
          }
          const barcode = result.getText().trim();
          if (!barcode) {
            return;
          }
          detectedRef.current = true;
          controlsRef.current?.stop();
          onDetected(barcode);
          onClose();
        }
      )
      .then((controls) => {
        if (disposed) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch(() => {
        if (!disposed) {
          setErrorMessage("Camera could not start. Allow camera permission and try again.");
        }
      });

    return () => {
      disposed = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen, onClose, onDetected]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "lg" }} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Scan Product Barcode</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Box borderRadius="16px" overflow="hidden" bg="black" minH="280px">
            <Box as="video" ref={videoRef} w="100%" minH="280px" objectFit="cover" muted playsInline />
          </Box>
          <Text mt={3} fontSize="sm" color={errorMessage ? "red.600" : "#6F594F"}>
            {errorMessage || "Point the rear camera at the barcode printed on the product packet."}
          </Text>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
